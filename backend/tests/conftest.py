import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import asyncio
import pytest


@pytest.fixture(autouse=True)
def isolate_ai_configuration(monkeypatch, tmp_path):
    """Tests must never use a developer's live key or consume their allowance."""
    from app.config import settings
    from app import ai_provider
    monkeypatch.setattr(settings, "ai_enabled", False)
    monkeypatch.setattr(settings, "ai_provider", "openai_compatible")
    monkeypatch.setattr(settings, "ai_api_key", "test-only-not-a-real-key")
    monkeypatch.setattr(settings, "ai_base_url", "https://example.invalid/v1")
    monkeypatch.setattr(settings, "ai_usage_path", str(tmp_path / "ai-usage.sqlite3"))
    monkeypatch.setattr(ai_provider, "_gate", asyncio.Semaphore(1))
    ai_provider._cache.clear()
    from app import jobs
    monkeypatch.setattr(settings,'jsearch_api_key','test-key-not-real')
    monkeypatch.setattr(settings,'jsearch_usage_path',str(tmp_path/'jobs.sqlite3'))
    monkeypatch.setattr(jobs,'_gate',asyncio.Lock())
    jobs._cache.clear()


@pytest.fixture
def ai_assessment_stub(monkeypatch):
    from app import main
    from app.cv_rating import PARAMETERS
    async def assess(cv,user,**kwargs):
        return {'score':77,'breakdown':[{'name':name,'weight':weight,'score':77,'explanation':'A source-grounded test assessment.','evidence':[]} for name,weight in PARAMETERS.values()],
                'skills':[],'strengths':['Clear test content'],'suggestions':['Review the draft.'],
                'analysis_mode':'ai-rating','ai_status':'Test AI assessment','note':'Not an ATS score.'}
    monkeypatch.setattr(main,'assess_cv',assess)


@pytest.fixture
def ai_extraction_stub(monkeypatch):
    """Source-based test double for onboarding tests, never a production fallback."""
    import re
    from app import main
    from app.schemas import CV
    async def extract(source,cv,user):
        lines=[line.strip() for line in source.splitlines() if line.strip()]
        def section(title):
            if title not in lines:return ''
            start=lines.index(title)+1
            end=next((index for index in range(start,len(lines)) if lines[index] in ('Education','Experience','Skills','Projects')),len(lines))
            return '\n'.join(lines[start:end])
        return CV(name=lines[0],education=section('Education'),experience=section('Experience'),projects=section('Projects'),
                  skills=section('Skills').split(),email=cv.email,phone=cv.phone)
    monkeypatch.setattr(main,'extract_cv',extract)
