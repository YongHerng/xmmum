"""Cloud file storage, no local cache, and safe/idempotent legacy migration."""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from app import learning_media
from app.config import Settings
from app.hosted_learning import Actor
from app.learning_media import SupabaseMediaStore, object_path, storage_reference
from migrate_learning_media import migrate_payload
from storage_fakes import FakeStorage, KEY, ORIGIN
from test_hosted_learning import learning_client, create_course


def cloud_store(cloud):
    return SupabaseMediaStore(Settings(_env_file=None, supabase_url=ORIGIN,
                                     supabase_publishable_key=KEY), httpx.MockTransport(cloud.handle), 'owner-session')


def legacy_course(tmp_path):
    content = b'%PDF-1.4\nA local source for cloud migration\n%%EOF'
    material = {'id':uuid4().hex, 'name':'A lesson.pdf', 'kind':'pdf', 'mime':'application/pdf', 'size':len(content)}
    (tmp_path / (material['id'] + '.bin')).write_bytes(content)
    course = {'id':str(uuid4()), 'title':'Preserve this', 'description':'Author introduction',
              'chapters':[{'id':str(uuid4()), 'materials':[material], 'questions':[{'prompt':'Keep quiz'}]}],
              'final_questions':[{'prompt':'Keep final'}]}
    return course, content


@pytest.mark.asyncio
async def test_migration_dry_run_never_calls_cloud_or_changes_course(tmp_path):
    course, _ = legacy_course(tmp_path)
    original = deepcopy(course)
    cloud = FakeStorage()
    result, report = await migrate_payload(course, tmp_path, cloud_store(cloud))
    assert result == course == original
    assert report['local_files'] == 1 and report['uploaded'] == report['verified'] == 0
    assert cloud.calls == [] and list(tmp_path.glob('*.bin'))


@pytest.mark.asyncio
async def test_migration_verifies_reuses_and_works_without_local_files(tmp_path):
    course, content = legacy_course(tmp_path)
    original = deepcopy(course)
    cloud = FakeStorage()
    store = cloud_store(cloud)
    migrated, report = await migrate_payload(course, tmp_path, store, apply=True)
    assert course == original
    assert report['uploaded'] == report['verified'] == 1
    assert migrated['title'] == course['title']
    assert migrated['final_questions'] == course['final_questions']
    assert migrated['chapters'][0]['questions'] == course['chapters'][0]['questions']
    material = migrated['chapters'][0]['materials'][0]
    assert material['sha256'] == hashlib.sha256(content).hexdigest()
    assert list(tmp_path.glob('*.bin'))  # Operator keeps recovery originals.
    retry, second = await migrate_payload(course, tmp_path, store, apply=True)
    assert retry == migrated and second['reused'] == 1 and second['uploaded'] == 0
    # All original local files can be absent on a new machine after migration.
    empty_machine = tmp_path / 'empty-machine'
    empty_machine.mkdir()
    final, verification = await migrate_payload(migrated, empty_machine, store, apply=True)
    assert final == migrated and verification['verified'] == 1
    another_backend = cloud_store(cloud)
    link = await another_backend.signed_link(material)
    async with httpx.AsyncClient(transport=httpx.MockTransport(cloud.handle)) as browser:
        assert (await browser.get(link['url'])).content == content
        assert (await browser.get(link['download_url'])).headers['content-disposition'].startswith('attachment')
    assert KEY not in json.dumps(link) and 'Authorization' not in json.dumps(link)


@pytest.mark.asyncio
async def test_migration_never_overwrites_conflicting_remote_bytes(tmp_path):
    course, _ = legacy_course(tmp_path)
    cloud = FakeStorage()
    material = course['chapters'][0]['materials'][0]
    key = 'learning-materials/' + object_path(course['id'], course['chapters'][0]['id'], material['id'], '.pdf')
    cloud.objects[key] = (b'%PDF-Different material', 'application/pdf')
    with pytest.raises(ValueError, match='checksum mismatch'):
        await migrate_payload(course, tmp_path, cloud_store(cloud), apply=True)
    assert cloud.objects[key][0] == b'%PDF-Different material'
    assert 'storage_provider' not in material


@pytest.mark.asyncio
async def test_migration_rejects_missing_local_file_without_touching_metadata(tmp_path):
    course, _ = legacy_course(tmp_path)
    missing = tmp_path / 'missing'
    with pytest.raises(ValueError, match='Missing'):
        await migrate_payload(course, missing, cloud_store(FakeStorage()))
    assert 'storage_provider' not in course['chapters'][0]['materials'][0]


@pytest.mark.asyncio
async def test_upload_cloud_failure_does_not_save_file_metadata(learning_client):
    owner = {'Authorization':f'Bearer {uuid4()}'}
    prefix = '/api/v1/learning'
    course = await create_course(learning_client, prefix, owner)
    base = f'{prefix}/studio/courses/{course["id"]}'
    learning_media.test_cloud.fail_upload = True
    uploaded = await learning_client.post(base+f'/chapters/{course["chapters"][0]["id"]}/materials',
        headers={**owner,'Content-Type':'application/pdf'}, params={'filename':'guide.pdf'}, content=b'%PDF-1.4\n%%EOF')
    assert uploaded.status_code == 502
    assert 'Private upstream secret' not in uploaded.text and KEY not in uploaded.text
    saved = (await learning_client.get(base, headers=owner)).json()['data']
    assert saved['chapters'][0]['materials'] == [] and not learning_media.test_cloud.objects


@pytest.mark.asyncio
async def test_database_save_failure_removes_unreferenced_cloud_upload(learning_client, monkeypatch):
    owner = {'Authorization':f'Bearer {uuid4()}'}
    course = await create_course(learning_client, '/api/v1/learning', owner)
    async def fail(self, course):
        raise ValueError('Simulated DB flush failure')
    monkeypatch.setattr(Actor, 'save_course', fail)
    response = await learning_client.post(f'/api/v1/learning/studio/courses/{course["id"]}/chapters/{course["chapters"][0]["id"]}/materials',
        headers={**owner,'Content-Type':'application/pdf'}, params={'filename':'guide.pdf'}, content=b'%PDF-1.4\n%%EOF')
    assert response.status_code == 503 and not learning_media.test_cloud.objects


@pytest.mark.asyncio
async def test_new_upload_is_cloud_reference_and_never_uses_filesystem(learning_client, monkeypatch):
    owner = {'Authorization':f'Bearer {uuid4()}'}
    course = await create_course(learning_client, '/api/v1/learning', owner)
    def forbidden(*args, **kwargs):
        raise AssertionError('Runtime lesson uploads must not write local files.')
    monkeypatch.setattr(Path, 'open', forbidden)
    monkeypatch.setattr(Path, 'write_bytes', forbidden)
    monkeypatch.setattr(Path, 'mkdir', forbidden)
    response = await learning_client.post(f'/api/v1/learning/studio/courses/{course["id"]}/chapters/{course["chapters"][0]["id"]}/materials',
        headers={**owner,'Content-Type':'application/pdf'}, params={'filename':'guide.pdf'}, content=b'%PDF-1.4\n%%EOF')
    assert response.status_code == 200
    material = response.json()['data']
    assert material['storage_provider'] == 'supabase'
    assert material['storage_path'].endswith('.pdf') and 'url' not in material
    assert len(learning_media.test_cloud.objects) == 1


@pytest.mark.asyncio
async def test_private_bucket_required_and_login_is_required():
    cloud = FakeStorage()
    cloud.buckets['learning-materials'] = {'id':'learning-materials','public':True}
    with pytest.raises(HTTPException) as error:
        await cloud_store(cloud).ensure_private_bucket()
    assert error.value.status_code == 503 and 'must be private' in error.value.detail
    store = SupabaseMediaStore(Settings(_env_file=None, supabase_url=ORIGIN, supabase_publishable_key=KEY), httpx.MockTransport(cloud.handle))
    with pytest.raises(HTTPException) as error:
        await store.ensure_private_bucket()
    assert error.value.status_code == 401 and 'Sign in' in error.value.detail


@pytest.mark.asyncio
async def test_server_secret_is_not_accepted_as_publishable_key():
    config = Settings(_env_file=None, supabase_url=ORIGIN,
                      supabase_publishable_key='sb_secret_should_not_be_here')
    with pytest.raises(HTTPException) as error:
        await SupabaseMediaStore(config).ensure_private_bucket()
    assert error.value.status_code == 503 and 'publishable' in error.value.detail


@pytest.mark.asyncio
async def test_storage_connection_errors_do_not_expose_credentials():
    def offline(request):
        raise httpx.ConnectError('Secret URL details must not be exposed', request=request)
    config = Settings(_env_file=None, supabase_url=ORIGIN, supabase_publishable_key=KEY)
    with pytest.raises(HTTPException) as error:
        await SupabaseMediaStore(config, httpx.MockTransport(offline), 'user-session').ensure_private_bucket()
    assert error.value.status_code == 503
    assert 'Secret URL details' not in error.value.detail and KEY not in error.value.detail


def test_legacy_and_tampered_references_are_not_local_fallbacks():
    material = {'id':uuid4().hex, 'mime':'application/pdf', 'name':'guide.pdf'}
    with pytest.raises(HTTPException) as error:
        storage_reference(material)
    assert error.value.status_code == 409 and 'migration' in error.value.detail
    for path in ('../../secret.pdf', 'https://attacker.test/file.pdf', '/etc/passwd'):
        with pytest.raises(HTTPException):
            storage_reference(dict(material, storage_provider='supabase', storage_bucket='learning-materials', storage_path=path))


@pytest.mark.asyncio
async def test_each_storage_call_uses_its_user_session_and_ignores_server_keys(monkeypatch):
    monkeypatch.setenv('SUPABASE_SECRET_KEY', 'sb_secret_must_never_be_used')
    cloud = FakeStorage()
    base = SupabaseMediaStore(Settings(_env_file=None, supabase_url=ORIGIN, supabase_publishable_key=KEY),
                             httpx.MockTransport(cloud.handle))
    for token in ('first-user-session', 'second-user-session'):
        await base.for_user(token).ensure_private_bucket()
    assert [c.headers['Authorization'] for c in cloud.calls] == ['Bearer first-user-session','Bearer second-user-session']
    assert all(c.headers['apikey'] == KEY for c in cloud.calls)
    assert base.access_token == ''  # No user token is cached globally.


@pytest.mark.asyncio
@pytest.mark.parametrize('status',[401,403])
async def test_user_auth_and_rls_errors_are_not_reported_as_server_failures(status):
    def denied(request):
        return httpx.Response(400, json={'statusCode':str(status),'message':'Private upstream internals'})
    config = Settings(_env_file=None, supabase_url=ORIGIN, supabase_publishable_key=KEY)
    with pytest.raises(HTTPException) as error:
        await SupabaseMediaStore(config,httpx.MockTransport(denied),'user-session').ensure_private_bucket()
    assert error.value.status_code == status and 'upstream internals' not in error.value.detail


@pytest.mark.asyncio
async def test_guest_practice_cannot_upload_or_sign_private_files(learning_client):
    prefix = '/api/v1/learning/sandbox'
    session = (await learning_client.post(prefix+'/sessions')).json()['data']['token']
    headers = {'X-Learning-Session':session}
    course = await create_course(learning_client,prefix,headers)
    base = f'{prefix}/studio/courses/{course["id"]}/chapters/{course["chapters"][0]["id"]}/materials'
    result = await learning_client.post(base,headers={**headers,'Content-Type':'application/pdf'},params={'filename':'guide.pdf'},content=b'%PDF-1.4\n%%EOF')
    assert result.status_code == 403 and 'personal workspace' in result.json()['detail']
    assert (await learning_client.get(base,headers=headers)).status_code == 403
    assert not learning_media.test_cloud.calls
