"""Live SDG and job news from the public Google News RSS search feed (no API key needed).

Results are cached in memory for 30 minutes per query so the feed stays fast and polite.
"""
import asyncio
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

import httpx

from .catalog import get_role
from .sdg_goals import ALL_SDGS, sdg_color, sdg_title
from .sdg_service import SKILL_SDG_FALLBACK, resolve_skill_id

FEED = "https://news.google.com/rss/search?q={query}&hl=en-MY&gl=MY&ceid=MY:en"
CACHE_SECONDS = 30 * 60
PER_QUERY = 8
_cache: dict[str, tuple[float, list[dict]]] = {}


def related_sdgs(role, skills, limit=4):
    """The user's SDGs: the selected career's goals first, then goals linked to their CV skills."""
    numbers = list(role["sdgs"]) if role else []
    for skill in skills:
        mapped = SKILL_SDG_FALLBACK.get(resolve_skill_id(skill))
        if mapped:
            numbers.append(mapped["sdg_number"])
    return list(dict.fromkeys(n for n in numbers if n in ALL_SDGS))[:limit] or [4, 8]


def parse_feed(xml_text):
    items = []
    for node in ET.fromstring(xml_text).iter("item"):
        title = (node.findtext("title") or "").strip()
        source = (node.findtext("source") or "").strip()
        if source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3]
        published = node.findtext("pubDate")
        try:
            published_at = parsedate_to_datetime(published).isoformat() if published else None
        except (TypeError, ValueError):
            published_at = None
        link = (node.findtext("link") or "").strip()
        if title and link.startswith("https://"):
            items.append({"title": title, "url": link, "source": source or "Google News", "published_at": published_at})
    return items


async def fetch_query(client, query):
    cached = _cache.get(query)
    if cached and time.monotonic() - cached[0] < CACHE_SECONDS:
        return cached[1]
    response = await client.get(FEED.format(query=quote_plus(query + " when:30d")))
    response.raise_for_status()
    items = parse_feed(response.text)[:PER_QUERY]
    _cache[query] = (time.monotonic(), items)
    return items


async def live_news(role_id, skills):
    role = get_role(role_id)
    sdgs = related_sdgs(role, skills)
    queries = [(query_text, {"category": "sdg", "sdg_number": n, "tag": f"SDG {n} · {sdg_title(n)}"})
               for n in sdgs for query_text in [ALL_SDGS[n][4]]]
    if role:
        queries.append((f'"{role["title"]}" jobs OR hiring OR careers', {"category": "job", "sdg_number": None, "tag": f"Jobs · {role['title']}"}))
        queries.append((f'{role["domain"]} jobs Malaysia', {"category": "job", "sdg_number": None, "tag": f"Jobs · {role['domain']}"}))
    async with httpx.AsyncClient(timeout=8, follow_redirects=True, headers={"User-Agent": "FutureProof/1.0"}) as client:
        results = await asyncio.gather(*(fetch_query(client, q) for q, _ in queries), return_exceptions=True)
    items, seen, failed = [], set(), 0
    for (_, meta), result in zip(queries, results):
        if isinstance(result, Exception):
            failed += 1
            continue
        for item in result:
            key = item["title"].casefold()
            if key not in seen:
                seen.add(key)
                items.append({**item, **meta, "id": str(len(items) + 1)})
    items.sort(key=lambda item: item["published_at"] or "", reverse=True)
    return {"items": items, "role": role["title"] if role else None,
            "sdgs": [{"number": n, "title": sdg_title(n), "color": sdg_color(n)} for n in sdgs],
            "partial": 0 < failed < len(queries), "unavailable": failed == len(queries),
            "disclosure_badge": "Live headlines from Google News · links open the original publisher"}
