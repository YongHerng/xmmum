"""Resolve AI skill labels to actual supplied evidence; never use fuzzy matches."""
import re
from unicodedata import normalize

from .catalog import SKILLS


def skill_name_key(value):
    """Normalise typography only; similar-looking abilities are not equivalents."""
    return re.sub(r'[\s_-]+', ' ', normalize('NFKC', value).casefold()).strip()


def resolve_skill_name(value, supplied):
    """Return an original supplied label for an exact name or catalogue alias.

    For example, a model's canonical SQL label can refer to supplied PostgreSQL
    evidence. Returning PostgreSQL, not another AI-selected alias, prevents the
    response from presenting a newly worded ability as a separate qualification.
    There is no substring, edit-distance, semantic or model-generated mapping.
    """
    if not isinstance(value, str):
        return None
    direct = {skill_name_key(item): item for item in supplied
              if isinstance(item, str) and item.strip()}
    key = skill_name_key(value)
    if key in direct:
        return direct[key]
    aliases = {skill_name_key(alias): identifier for identifier, (name, values) in SKILLS.items()
               for alias in (identifier, name, *values)}
    canonical = aliases.get(key)
    if canonical is None:
        return None
    return next((actual for source_key, actual in direct.items() if aliases.get(source_key) == canonical), None)
