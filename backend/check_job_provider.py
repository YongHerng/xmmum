"""Explicit public-query provider diagnostic. No private CV/profile is sent."""
import asyncio,json,argparse
from pathlib import Path
import httpx
from app.config import settings


async def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--live',action='store_true')
    if not parser.parse_args().live:
        print('No requests submitted. Use --live for two explicit provider diagnostics.')
        return
    async with httpx.AsyncClient(timeout=30) as client:
        for endpoint,params in [('https://api.openwebninja.com/usage',{'api_id':'jsearch'}),
                                ('https://api.openwebninja.com/jsearch/search-v2',{'query':'junior network engineer in Kuala Lumpur','country':'my','language':'en','date_posted':'month'})]:
            response=await client.get(endpoint,params=params,headers={'x-api-key':settings.jsearch_api_key})
            try: payload=response.json()
            except ValueError: payload={}
            report={'operation':endpoint.rsplit('/',1)[-1],'status':response.status_code,'keys':list(payload) if isinstance(payload,dict) else type(payload).__name__}
            if response.is_success and endpoint.endswith('search-v2'):
                folder=Path(__file__).resolve().parents[1]/'.private-ai-tests';folder.mkdir(exist_ok=True)
                (folder/'jsearch-envelope.json').write_text(json.dumps(payload),encoding='utf-8')
                report['data_shape']={key:type(value).__name__ for key,value in payload.get('data',{}).items()} if isinstance(payload.get('data'),dict) else type(payload.get('data')).__name__
            elif not response.is_success:
                report['issue']=str(payload.get('message') or payload.get('error') or 'Provider access error').replace(settings.jsearch_api_key,'[redacted]')[:300]
            print(json.dumps(report))


if __name__=='__main__':asyncio.run(main())
