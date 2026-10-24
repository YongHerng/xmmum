"""Private Supabase Storage for authored PDF/video lessons; no local file cache.

Course JSON holds immutable object references, never file bytes or signed URLs.
The course API checks ownership/enrollment before issuing temporary cloud links.
"""
import hashlib
import re
from pathlib import PurePosixPath
from time import time
from urllib.parse import parse_qs, quote, urlencode, urlsplit
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, HTTPException, Request

from .config import settings

router = APIRouter()  # Old process-local /media links are deliberately retired.
LINK_LIFETIME = 6 * 60 * 60
FILE_TYPES = {
    '.pdf': ('pdf', 'application/pdf', 20 * 1024 * 1024),
    '.mp4': ('video', 'video/mp4', 100 * 1024 * 1024),
    '.webm': ('video', 'video/webm', 100 * 1024 * 1024),
}
MAX_COURSE_BYTES = 500 * 1024 * 1024
MAX_CHAPTER_FILES = 20


def valid_signature(header, suffix):
    if suffix == '.pdf':
        return header.startswith(b'%PDF-')
    if suffix == '.mp4':
        return len(header) >= 12 and header[4:8] == b'ftyp'
    return header.startswith(b'\x1a\x45\xdf\xa3') and b'webm' in header


def object_path(course_id, chapter_id, material_id, suffix, practice=False):
    try:
        course_id, chapter_id = str(UUID(course_id)), str(UUID(chapter_id))
    except (ValueError, TypeError, AttributeError):
        raise HTTPException(422, 'Invalid course or chapter identifier.') from None
    if not re.fullmatch(r'[0-9a-f]{32}', material_id) or suffix not in FILE_TYPES:
        raise HTTPException(422, 'Invalid learning file identifier or type.')
    return f'{"practice" if practice else "courses"}/{course_id}/{chapter_id}/{material_id}{suffix}'


def storage_reference(material):
    bucket, path = material.get('storage_bucket', ''), material.get('storage_path', '')
    if material.get('storage_provider') != 'supabase' or not bucket or not path:
        raise HTTPException(409, 'This lesson file still needs cloud migration. Ask the course owner to run the learning media migration.')
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', bucket):
        raise HTTPException(409, 'This lesson has an invalid storage reference.')
    pieces = path.split('/')
    if len(pieces) != 4 or pieces[0] not in ('courses', 'practice'):
        raise HTTPException(409, 'This lesson has an invalid storage reference.')
    suffix = PurePosixPath(path).suffix
    expected = object_path(pieces[1], pieces[2], material['id'], suffix, pieces[0] == 'practice')
    if path != expected or FILE_TYPES[suffix][1] != material.get('mime'):
        raise HTTPException(409, 'This lesson has an invalid storage reference.')
    return bucket, path


class SupabaseMediaStore:
    """REST adapter. Credentials only go to the configured Storage API."""
    def __init__(self, config=settings, transport=None, access_token=''):
        self.config, self.transport, self.access_token = config, transport, access_token

    def for_user(self, access_token):
        return SupabaseMediaStore(self.config, self.transport, access_token)

    def configuration(self):
        origin = self.config.supabase_url.rstrip('/')
        key = self.config.supabase_publishable_key.strip()
        parsed = urlsplit(origin)
        if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment or not key):
            raise HTTPException(503, 'Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY for cloud lesson storage.')
        if key.startswith('sb_secret_'):
            raise HTTPException(503, 'Lesson storage requires the publishable key, not a privileged server key.')
        if not self.access_token:
            raise HTTPException(401, 'Sign in to access private course files.', headers={'WWW-Authenticate':'Bearer'})
        bucket = self.config.learning_storage_bucket
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', bucket):
            raise HTTPException(503, 'The learning storage bucket setting is invalid.')
        return origin, key, bucket

    async def request(self, method, path, *, allowed=(), **kwargs):
        origin, key, _ = self.configuration()
        # The caller's session, not a privileged server identity, is evaluated
        # by Supabase Storage RLS for every file operation.
        headers = {'apikey': key, 'Authorization': f'Bearer {self.access_token}'}
        headers.update(kwargs.pop('headers', {}))
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(180, connect=15),
                                         transport=self.transport, follow_redirects=False) as client:
                response = await client.request(method, origin + '/storage/v1' + path, headers=headers, **kwargs)
        except httpx.RequestError:
            raise HTTPException(503, 'Supabase lesson storage could not be reached. Please retry.') from None
        code = response.status_code
        if code >= 400:
            try:
                reported = int(response.json().get('statusCode', code))
                if 400 <= reported <= 599:
                    code = reported
            except (ValueError, TypeError, AttributeError):
                pass
        if response.is_success or code in allowed:
            return response, code
        if code == 401:
            raise HTTPException(401, 'Your login session expired. Sign in again to access course files.', headers={'WWW-Authenticate':'Bearer'})
        if code == 403:
            raise HTTPException(403, 'Your account does not have permission to access this learning file.')
        if code == 404:
            raise HTTPException(404, 'This cloud learning file is unavailable. Ask the course author to check its upload.')
        if code == 413:
            raise HTTPException(413, 'The file exceeds the Supabase Storage project or bucket size limit.')
        raise HTTPException(502, 'Supabase lesson storage could not complete the request. Please retry.')

    async def ensure_private_bucket(self, bucket=None):
        _, _, configured = self.configuration()
        bucket = bucket or configured
        if bucket != configured:
            raise HTTPException(409, 'This lesson points to a different storage bucket. Check the backend configuration.')
        response, code = await self.request('GET', f'/bucket/{quote(bucket)}', allowed=(404,))
        if code == 404:
            raise HTTPException(503, 'Private lesson storage is not ready. Apply learning Storage migration 004 and check the configured bucket.')
        if response.json().get('public') is not False:
            raise HTTPException(503, 'The learning storage bucket must be private. Public lesson buckets are not supported.')
        return bucket

    async def put(self, bucket, path, content, mime):
        # New file IDs get new objects; never overwrite existing material.
        await self.request('POST', f'/object/{quote(bucket)}/{quote(path, safe="/")}',
                           content=content, headers={'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': 'private, no-store'})

    async def delete(self, bucket, path):
        await self.request('DELETE', f'/object/{quote(bucket)}', json={'prefixes': [path]})

    async def download(self, bucket, path):
        response, code = await self.request('GET', f'/object/authenticated/{quote(bucket)}/{quote(path, safe="/")}', allowed=(404,))
        return None if code == 404 else response.content

    async def signed_link(self, material):
        bucket, path = storage_reference(material)
        await self.ensure_private_bucket(bucket)
        response, _ = await self.request('POST', f'/object/sign/{quote(bucket)}/{quote(path, safe="/")}', json={'expiresIn': LINK_LIFETIME})
        value = response.json().get('signedURL', '')
        origin, _, _ = self.configuration()
        if value.startswith('/object/sign/'):
            url = origin + '/storage/v1' + value
        elif value.startswith(origin + '/storage/v1/object/sign/'):
            url = value
        else:
            raise HTTPException(502, 'Supabase returned an invalid lesson link. Please retry.')
        parsed = urlsplit(url)
        if parsed.path != '/storage/v1/object/sign/' + bucket + '/' + path or not parse_qs(parsed.query).get('token'):
            raise HTTPException(502, 'Supabase returned an invalid lesson link. Please retry.')
        return dict(material, url=url, download_url=url + '&' + urlencode({'download': material['name']}), expires_at=int(time()) + LINK_LIFETIME)


storage = SupabaseMediaStore()


async def store_upload(request: Request, filename: str, remaining_bytes: int, *, course_id, chapter_id, store):
    if not filename or len(filename) > 180 or any(not char.isprintable() or char in '/\\' for char in filename):
        raise HTTPException(422, 'Use a file name up to 180 characters, without directory paths.')
    suffix = PurePosixPath(filename).suffix.lower()
    if suffix not in FILE_TYPES:
        raise HTTPException(415, 'Choose a PDF, MP4 or WEBM file.')
    kind, mime, type_limit = FILE_TYPES[suffix]
    if request.headers.get('content-type', '').split(';')[0] not in (mime, 'application/octet-stream'):
        raise HTTPException(415, 'The file type does not match its extension.')
    limit = min(type_limit, remaining_bytes)
    try:
        declared = int(request.headers.get('content-length', '0'))
        if declared < 0:
            raise ValueError()
    except ValueError:
        raise HTTPException(400, 'Invalid upload length.') from None
    if limit <= 0 or declared > limit:
        raise HTTPException(413, 'File exceeds its size limit or the 500 MB course allowance.')
    # A bounded transient memory buffer, never a local file or disk spool.
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > limit:
            raise HTTPException(413, 'Upload exceeds the allowed file size or course allowance.')
        content.extend(chunk)
    if not content or not valid_signature(content[:4096], suffix):
        raise HTTPException(415, 'This file does not contain a supported PDF or video. Renaming a file is not enough.')
    material = dict(id=uuid4().hex, name=filename, kind=kind, mime=mime, size=len(content),
                    sha256=hashlib.sha256(content).hexdigest(), storage_provider='supabase')
    path = object_path(course_id, chapter_id, material['id'], suffix)
    bucket = await store.ensure_private_bucket()
    await store.put(bucket, path, bytes(content), mime)
    return dict(material, storage_bucket=bucket, storage_path=path)


async def discard_upload(material, store):
    bucket, path = storage_reference(material)
    await store.delete(bucket, path)
