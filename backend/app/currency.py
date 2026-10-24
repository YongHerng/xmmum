import json
from pathlib import Path


COUNTRIES = json.loads((Path(__file__).resolve().parents[2] / "shared" / "countries.json").read_text())


def currency_for_location(location):
    normalized = location.strip().casefold()
    aliases = {"uk": "GBP", "usa": "USD", "us": "USD", "uae": "AED", "united states of america": "USD", "korea": "KRW"}
    if normalized in aliases:
        return aliases[normalized]
    return next((currency for country, currency in COUNTRIES if normalized == country.casefold() or normalized.endswith(", " + country.casefold())), None)
