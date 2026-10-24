"""Move existing lesson files to private Supabase Storage, without deleting sources.

Dry run is the default. --apply uploads and verifies SHA-256 before committing
each course's new object references. Re-running reuses only identical objects.
No course content, questions, enrollments, attempts or badges are seeded/changed.
"""
import argparse
import asyncio
from copy import deepcopy
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import os
from getpass import getpass

from fastapi import HTTPException
from sqlalchemy import select

from app.db import HostedCourse, Session, engine
from app.learning_media import FILE_TYPES, object_path, storage_reference, storage, valid_signature
from app.config import settings
from app.security import verify_token
import httpx


async def migrate_payload(course, source, store=storage, apply=False):
    updated = deepcopy(course)
    report = {'course_id': course['id'], 'local_files': 0, 'cloud_files': 0,
              'uploaded': 0, 'reused': 0, 'verified': 0, 'bytes': 0}
    bucket = await store.ensure_private_bucket() if apply else None
    for chapter in updated.get('chapters', []):
        for material in chapter.get('materials', []):
            if material.get('storage_provider') == 'supabase':
                saved_bucket, path = storage_reference(material)
                report['cloud_files'] += 1
                if apply:
                    content = await store.download(saved_bucket, path)
                    if content is None or not material.get('sha256') or hashlib.sha256(content).hexdigest() != material['sha256']:
                        raise ValueError(f'Cloud verification failed for material {material["id"]}.')
                    report['verified'] += 1
                continue
            material_id = material.get('id', '')
            if not re.fullmatch(r'[0-9a-f]{32}', material_id):
                raise ValueError('Invalid legacy file identifier; nothing was committed.')
            suffix = PurePosixPath(material['name']).suffix.lower()
            if suffix not in FILE_TYPES or FILE_TYPES[suffix][1] != material.get('mime'):
                raise ValueError(f'Invalid legacy file type for {material_id}.')
            path = object_path(course['id'], chapter['id'], material_id, suffix)
            local = source / (material_id + '.bin')
            if not local.is_file() or not 0 < local.stat().st_size <= FILE_TYPES[suffix][2]:
                raise ValueError(f'Missing or oversized local file: {material_id}.bin')
            content = local.read_bytes()
            digest = hashlib.sha256(content).hexdigest()
            if len(content) != material.get('size') or not valid_signature(content[:4096], suffix):
                raise ValueError(f'Local file differs from its course record: {material_id}.bin')
            if material.get('sha256') and digest != material['sha256']:
                raise ValueError(f'Local checksum mismatch: {material_id}.bin')
            report['local_files'] += 1
            report['bytes'] += len(content)
            if not apply:
                continue
            remote = await store.download(bucket, path)
            if remote is None:
                await store.put(bucket, path, content, material['mime'])
                report['uploaded'] += 1
                remote = await store.download(bucket, path)
            else:
                report['reused'] += 1
            if remote is None or hashlib.sha256(remote).hexdigest() != digest:
                raise ValueError(f'Cloud checksum mismatch for {material_id}; course record not committed.')
            report['verified'] += 1
            material.update(storage_provider='supabase', storage_bucket=bucket,
                            storage_path=path, sha256=digest)
    return updated, report


async def main(args):
    if Session is None:
        raise ValueError('Configure DATABASE_URL in the root .env first.')
    store = storage
    user = None
    if args.apply:
        token = os.environ.get('LEARNING_MIGRATION_ACCESS_TOKEN', '')
        if not token:
            email = args.email or input('Course owner email: ').strip()
            password = getpass('Course owner password (not saved): ')
            async with httpx.AsyncClient(timeout=30) as auth:
                response = await auth.post(settings.supabase_url + '/auth/v1/token?grant_type=password',
                    headers={'apikey': settings.supabase_publishable_key}, json={'email': email, 'password': password})
            if not response.is_success:
                raise ValueError('Course owner sign-in failed. No files or course records changed.')
            token = response.json()['access_token']
        user = await asyncio.to_thread(verify_token, token)
        store = storage.for_user(token)
    async with Session() as db:
        query = select(HostedCourse.id)
        if user:
            query = query.where(HostedCourse.user_id == user)
        if args.course_id:
            query = query.where(HostedCourse.id == args.course_id)
        ids = list(await db.scalars(query))
        await db.rollback()
        if args.course_id and not ids:
            raise ValueError('The requested course does not exist.')
        reports = []
        for course_id in ids:
            async with db.begin():
                query = select(HostedCourse).where(HostedCourse.id == course_id)
                row = await db.scalar(query.with_for_update() if args.apply else query)
                payload, report = await migrate_payload(dict(row.payload, id=row.id), args.source, store, apply=args.apply)
                if args.apply and report['local_files']:
                    row.payload = payload
                reports.append(report)
        print(json.dumps({'mode': 'apply' if args.apply else 'dry-run', 'courses': reports,
                          'source_files_deleted': 0}, indent=2))
    await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--course-id', help='Optional single course; otherwise process all saved courses.')
    parser.add_argument('--email', help='Course owner email for interactive sign-in on --apply. Password is never saved.')
    parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parent / '.learning-media')
    parser.add_argument('--apply', action='store_true', help='Upload, verify and persist cloud references. Never deletes local originals.')
    arguments = parser.parse_args()
    try:
        asyncio.run(main(arguments))
    except HTTPException as error:
        parser.exit(1, f'Migration stopped: {error.detail}\n')
    except ValueError as error:
        parser.exit(1, f'Migration stopped: {error}\n')
