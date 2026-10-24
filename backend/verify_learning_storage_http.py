"""Interactive live user-session Storage check; never saves passwords or tokens.

Reads an existing course's PDFs using only the publishable key and user login.
Optional --upload-check creates a private throwaway draft, uploads a PDF through
the real API, verifies it, then removes only that test object and course row.
"""
import argparse
import asyncio
from getpass import getpass
import hashlib
import json

import httpx
import jwt
from sqlalchemy import delete, select

from app.config import settings
from app.db import HostedCourse, Session, engine
from app.security import verify_token


async def main(args, password):
    async with httpx.AsyncClient(timeout=60) as client:
        login = await client.post(settings.supabase_url + '/auth/v1/token?grant_type=password',
            headers={'apikey':settings.supabase_publishable_key}, json={'email':args.email,'password':password})
        if not login.is_success:
            raise ValueError('Sign-in failed. No course or file data was changed.')
        token = login.json()['access_token']
        # Allow a freshly issued token to reach its iat on a slightly slower
        # local clock, without disabling any verification or adding leeway.
        for attempt in range(6):
            try:
                user = await asyncio.to_thread(verify_token, token)
                break
            except jwt.ImmatureSignatureError:
                if attempt == 5:
                    raise ValueError('Local clock is behind Auth; synchronize the computer clock and retry.') from None
                await asyncio.sleep(1)
        headers = {'Authorization':'Bearer '+token}
        storage_headers = {**headers,'apikey':settings.supabase_publishable_key}
        base = args.api.rstrip('/') + '/learning'

        async def api(method, path, **kwargs):
            response = await client.request(method,base+path,headers={**headers,**kwargs.pop('headers',{})},**kwargs)
            if not response.is_success:
                # Do not echo URLs, tokens, credentials or private payloads.
                raise ValueError(f'Learning API check failed with HTTP {response.status_code}.')
            return response.json()['data']

        course = await api('GET','/courses/'+args.course_id)
        verified = 0
        source = None
        for chapter in course['chapters']:
            path = f'/courses/{course["id"]}/chapters/{chapter["id"]}/materials'
            if not course.get('enrollment'):
                path = f'/studio/courses/{course["id"]}/chapters/{chapter["id"]}/materials'
            files = await api('GET',path)
            for material in files:
                if material['kind'] != 'pdf':
                    continue
                result = await client.get(material['url'],headers={'Origin':'http://127.0.0.1:3000'})
                assert result.status_code == 200 and result.content.startswith(b'%PDF-')
                assert hashlib.sha256(result.content).hexdigest() == material['sha256']
                if source is None:
                    source = result.content
                    range_result = await client.get(material['url'],headers={'Range':'bytes=0-4'})
                    assert range_result.status_code == 206 and range_result.content == b'%PDF-'
                verified += 1
        assert verified, 'Choose an existing course with at least one PDF.'
        guest = await client.get(base+f'/courses/{course["id"]}/chapters/{course["chapters"][0]["id"]}/materials')
        assert guest.status_code == 401

        upload_verified = False
        test_course = None
        uploaded = None
        try:
            if args.upload_check:
                test_course = await api('POST','/studio/courses',json={
                    'title':'Temporary Storage permission verification',
                    'provider':'Verification', 'description':'Private throwaway API test; removed immediately.'})
                target = '/studio/courses/'+test_course['id']
                created = await api('POST',target+'/chapters',json={'title':'Upload verification'})
                chapter = created['chapters'][0]
                chapter_path = target+'/chapters/'+chapter['id']
                lesson = await api('POST',chapter_path+'/subsections',json={'title':'PDF verification'})
                section = lesson['chapters'][0]['subsections'][0]
                uploaded = await api('POST',chapter_path+'/materials',headers={'Content-Type':'application/pdf'},
                    params={'filename':'permission-check.pdf','subsection_id':section['id']},content=source)
                links = await api('GET',chapter_path+'/materials')
                viewed = await client.get(links[0]['url'])
                assert viewed.status_code == 200 and viewed.content == source
                upload_verified = True
        finally:
            if uploaded:
                removed = await client.request('DELETE',settings.supabase_url+'/storage/v1/object/'+uploaded['storage_bucket'],
                    headers=storage_headers,json={'prefixes':[uploaded['storage_path']]})
                assert removed.is_success, 'Temporary object cleanup failed; its private draft was retained for recovery.'
            if test_course:
                async with Session() as db:
                    row = await db.scalar(select(HostedCourse).where(HostedCourse.id==test_course['id'],HostedCourse.user_id==user))
                    assert row and row.payload['title']=='Temporary Storage permission verification' and not row.payload['published']
                    await db.execute(delete(HostedCourse).where(HostedCourse.id==test_course['id'],HostedCourse.user_id==user))
                    await db.commit()
        print(json.dumps({'verified_pdfs':verified,'guest_api_status':guest.status_code,
            'draft_upload_verified':upload_verified,'temporary_test_course_retained':False,
            'privileged_storage_key_used':False},indent=2))
    await engine.dispose()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--email',required=True)
    parser.add_argument('--course-id',required=True)
    parser.add_argument('--api',default='http://127.0.0.1:8000/api/v1')
    parser.add_argument('--upload-check',action='store_true')
    args = parser.parse_args()
    try:
        asyncio.run(main(args,getpass('Course owner password (not saved): ')))
    except ValueError as error:
        parser.exit(1,f'Verification stopped: {error}\n')
