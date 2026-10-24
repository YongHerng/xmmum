import httpx  # Shared module retained for existing provider transport tests.
from .config import settings
from .schemas import AIReview
from .ai_provider import generate, AIUnavailable


async def review_cv(cv, actor="cv-review"):
    # This helper is called only for an explicit review action, never a save.
    if not (settings.ai_enabled and settings.ai_api_key and settings.ai_model):
        return None
    from .engine import evaluate
    content = cv.model_dump(exclude={"name", "email", "phone", "ai_consent"})
    content["calculated_rating"] = evaluate(cv)
    try:
        return (await generate("cv-review", "Explain the supplied rubric breakdown. Its numbers are "
                               "authoritative; do not assign scores. Give at most six concise writing "
                               "suggestions. Never invent facts or achievements.", content, AIReview,
                               actor=actor, cv=cv)).model_dump()
    except AIUnavailable:
        return None
