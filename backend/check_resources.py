"""Check official links; never fetches or transmits CV or credential content."""

import asyncio
import httpx
from app.catalog import RESOURCES


async def main():
    async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:

        async def check(resource):
            try:
                response = await client.get(resource["url"])
                print(resource["id"], response.status_code)
            except Exception as exc:
                print(resource["id"], type(exc).__name__)

        await asyncio.gather(*(check(r) for r in RESOURCES))


asyncio.run(main())
