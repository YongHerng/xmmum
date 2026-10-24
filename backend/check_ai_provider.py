"""Explicit, one-request live smoke test; never prints keys or private CVs."""
import argparse
import asyncio
import json
from pathlib import Path

import httpx

from app.ai_provider import AIUnavailable, generate
from app.config import settings
from app.schemas import AIReview


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', help='Submit one billable request using local credentials.')
    args = parser.parse_args()
    if not args.live:
        print(json.dumps({'key_present':bool(settings.ai_api_key), 'provider':settings.ai_provider,
                          'model':settings.ai_model, 'live_request':False}))
        return
    settings.ai_enabled = True
    settings.ai_max_output_tokens = 256
    settings.ai_timeout_seconds = 45
    # This operator test sends synthetic data only. Retain response shapes for
    # diagnosing worker formats, never request headers or credentials.
    responses = []
    async def record_response(response):
        await response.aread()
        try:
            payload = response.json()
            responses.append({'status_code':response.status_code,'payload':payload})
        except ValueError:
            responses.append({'status_code':response.status_code,'json':False})
    original_client = httpx.AsyncClient
    httpx.AsyncClient = lambda **kwargs: original_client(event_hooks={'response':[record_response]}, **kwargs)
    try:
        result = await generate('connection-smoke-test', 'Return summary="AI connection verified" and suggestions=[].',
                                {'purpose':'Test structured JSON connectivity only. No personal data.'},
                                AIReview, actor='operator-smoke-test')
        print(json.dumps({'success':True, 'validated_json':True, 'model':settings.ai_model,
                          'suggestion_count':len(result.suggestions)}))
    except AIUnavailable as exc:
        print(json.dumps({'success':False, 'reason':str(exc), 'automatic_retries':0}))
        raise SystemExit(1)
    finally:
        httpx.AsyncClient = original_client
        folder = Path(__file__).resolve().parents[1] / '.private-ai-tests'
        folder.mkdir(exist_ok=True)
        (folder/'runpod-smoke-response.json').write_text(json.dumps(responses,indent=2),encoding='utf-8')


if __name__ == '__main__':
    asyncio.run(main())
