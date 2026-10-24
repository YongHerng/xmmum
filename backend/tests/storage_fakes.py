"""In-memory Supabase Storage HTTP contract for tests; never writes lesson files."""
import json
from time import time
from uuid import uuid4
from urllib.parse import quote

import httpx

ORIGIN = 'https://storage.test'
KEY = 'sb_publishable_test_only'


class FakeStorage:
    def __init__(self):
        self.buckets = {'learning-materials': {'id':'learning-materials','public':False}}
        self.objects = {}
        self.tokens = {}
        self.calls = []
        self.fail_upload = False

    async def handle(self, request):
        self.calls.append(request)
        path = request.url.path.removeprefix('/storage/v1')
        method = request.method
        signed = path.startswith('/object/sign/') and method == 'GET'
        if not signed and (request.headers.get('apikey') != KEY or not request.headers.get('Authorization','').startswith('Bearer ')):
            return httpx.Response(403, json={'message': 'Storage credential rejected'})
        if path.startswith('/bucket/') and method == 'GET':
            bucket = path.removeprefix('/bucket/')
            return httpx.Response(200, json=self.buckets[bucket]) if bucket in self.buckets else httpx.Response(400, json={'statusCode':'404','message':'Bucket not found'})
        if path == '/bucket' and method == 'POST':
            body = json.loads(request.content)
            self.buckets[body['id']] = body
            return httpx.Response(200, json={'name': body['id']})
        if path.startswith('/object/sign/'):
            object_key = path.removeprefix('/object/sign/')
            if object_key not in self.objects:
                return httpx.Response(404, json={'message':'Object missing'})
            if method == 'POST':
                token = uuid4().hex
                self.tokens[token] = (object_key, time() + json.loads(request.content)['expiresIn'])
                return httpx.Response(200, json={'signedURL': f'/object/sign/{quote(object_key, safe="/")}?token={token}'})
            token = self.tokens.get(request.url.params.get('token'))
            if not token or token[0] != object_key or token[1] < time():
                return httpx.Response(403, json={'message':'Invalid or expired token'})
            content, mime = self.objects[object_key]
            headers = {'Content-Type':mime, 'Accept-Ranges':'bytes', 'Cache-Control':'private, no-store'}
            if 'download' in request.url.params:
                headers['Content-Disposition'] = 'attachment; filename="lesson"'
            if request.headers.get('Range'):
                start, end = request.headers['Range'].removeprefix('bytes=').split('-')
                start, end = int(start), int(end) if end else len(content)-1
                headers['Content-Range'] = f'bytes {start}-{end}/{len(content)}'
                return httpx.Response(206, content=content[start:end+1], headers=headers)
            return httpx.Response(200, content=content, headers=headers)
        if path.startswith('/object/authenticated/') and method == 'GET':
            key = path.removeprefix('/object/authenticated/')
            if key not in self.objects:
                return httpx.Response(404, json={'message':'Object missing'})
            content, mime = self.objects[key]
            return httpx.Response(200, content=content, headers={'Content-Type':mime})
        if path.startswith('/object/') and method == 'POST':
            if self.fail_upload:
                return httpx.Response(500, json={'message':'Private upstream secret: do not expose'})
            key = path.removeprefix('/object/')
            if key in self.objects:
                return httpx.Response(409, json={'message':'Already exists'})
            self.objects[key] = (request.content, request.headers['content-type'])
            return httpx.Response(200, json={'Key':key})
        if path.startswith('/object/') and method == 'DELETE':
            bucket = path.removeprefix('/object/')
            for key in json.loads(request.content)['prefixes']:
                self.objects.pop(bucket + '/' + key, None)
            return httpx.Response(200, json=[])
        return httpx.Response(404, json={'message':'No fake route'})


class AppAndStorageTransport(httpx.AsyncBaseTransport):
    def __init__(self, app, cloud):
        self.app = httpx.ASGITransport(app=app)
        self.cloud = httpx.MockTransport(cloud.handle)

    async def handle_async_request(self, request):
        return await (self.cloud if request.url.host == 'storage.test' else self.app).handle_async_request(request)
