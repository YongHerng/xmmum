from typing import Literal, Annotated
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Profile(StrictModel):
    name: str = Field(default="", max_length=100)
    category: Literal["", "student", "graduate", "professional", "switcher"] = ""
    location: str = Field(default="", max_length=100)
    education: str = Field(default="", max_length=5000)
    goal: str = Field(default="", max_length=500)
    onboarding_complete: bool = False
    # None identifies profiles created before the feature introduction existed.
    feature_guide_seen: bool | None = None


class Answers(StrictModel):
    category: Literal["", "student", "graduate", "professional", "switcher"] = ""
    interests: list[str] = Field(default_factory=list, max_length=8)
    work_style: Literal["", "analytical", "creative", "practical", "people"] = ""
    environment: Literal["", "structured", "flexible"] = ""
    motivation: Literal["", "growth", "stability", "impact", "balance"] = ""
    weekly_hours: int | None = Field(default=None, ge=1, le=40)
    budget: int | None = Field(default=None, ge=0, le=50000)
    location: str = Field(default="", max_length=100)
    relocation: bool | None = None
    strengths: list[str] = Field(default_factory=list, max_length=8)
    career_goal: str = Field(default="", max_length=500)
    social_energy: Literal["", "independent", "collaborative", "mixed"] = ""
    decision_style: Literal["", "evidence", "values", "both"] = ""
    learning_style: Literal["", "practice", "reading", "discussion"] = ""
    completed_step: int = Field(default=0, ge=0, le=5)

    def missing_fields(self):
        required = ("category", "interests", "strengths", "career_goal", "work_style", "environment",
                    "social_energy", "decision_style", "motivation", "learning_style", "location")
        missing = [field for field in required if not getattr(self, field)
                   or isinstance(getattr(self, field), list) and not any(str(value).strip() for value in getattr(self, field))]
        return missing + [field for field in ("weekly_hours", "budget", "relocation") if getattr(self, field) is None]


class CVEntry(StrictModel):
    section: Literal['education','experience','projects','membership_licensure','certificates_training']
    title: str = Field(max_length=300)
    organisation: str = Field(default='', max_length=300)
    dates: str = Field(default='', max_length=150)
    bullets: list[Annotated[str,Field(max_length=2000)]] = Field(default_factory=list, max_length=30)


class CVSection(StrictModel):
    title: str = Field(min_length=1, max_length=150)
    content: str = Field(default='', max_length=10000)


class CV(StrictModel):
    name: str = Field(default="", max_length=100)
    email: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=50)
    summary: str = Field(default="", max_length=5000)
    education: str = Field(default="", max_length=5000)
    experience: str = Field(default="", max_length=10000)
    projects: str = Field(default="", max_length=10000)
    membership_licensure: str = Field(default="", max_length=5000)
    certificates_training: str = Field(default="", max_length=5000)
    skills: list[str] = Field(default_factory=list, max_length=100)
    target_role: str = Field(default="", max_length=100)
    ai_consent: bool = False

    # Canonical skills copied from course awards; do not promote them to full CV credit.
    course_skill_ids: list[str] = Field(default_factory=list, max_length=100)
    entries: list[CVEntry] = Field(default_factory=list, max_length=50)
    additional_sections: list[CVSection] = Field(default_factory=list, max_length=30)
    structure_version: int = Field(default=1, ge=1, le=2)

    @field_validator('entries')
    @classmethod
    def bound_entries(cls,values):
        if sum(len(entry.title)+len(entry.organisation)+len(entry.dates)+sum(map(len,entry.bullets)) for entry in values)>50000:
            raise ValueError('Structured CV entries exceed the supported length.')
        return values

    @field_validator('additional_sections')
    @classmethod
    def bound_sections(cls, values):
        if sum(len(item.title)+len(item.content) for item in values)>50000:
            raise ValueError('Additional CV sections exceed the supported length.')
        return values


class ScenarioRequest(StrictModel):
    scenario: Literal["moderate", "rapid"] = "moderate"
    horizon: Literal[3, 5, 10] = 5
    role_id: str | None = None


class PathwayRequest(StrictModel):
    role_id: str


class ProgressRequest(StrictModel):
    step_id: str
    complete: bool


class AIReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    suggestions: list[str] = Field(max_length=6)
    summary: str = Field(max_length=1500)


class SDGMappingRequest(StrictModel):
    role_id: str = Field(default="data-analyst", max_length=100)
    skills: list[str] = Field(default_factory=list, max_length=100)
    force_refresh: bool = False

    @field_validator("skills")
    @classmethod
    def bounded_skills(cls, values):
        if any(not value.strip() or len(value) > 100 for value in values):
            raise ValueError("Each skill must contain 1 to 100 characters.")
        return [value.strip() for value in values]


class NewsDigestRequest(StrictModel):
    role_id: str = Field(default="data-analyst", max_length=100)
    skills: list[str] = Field(default_factory=list, max_length=100)
    selected_news_ids: list[int] = Field(default_factory=list, max_length=20)


class SDGSummaryRequest(SDGMappingRequest):
    ai_consent: bool = False


class ForumPostRequest(StrictModel):
    content: str = Field(min_length=1, max_length=3000)
    sdg_badge: str = Field(default="SDG 4 · Learning", max_length=150)
    skill_tag: str = Field(default="", max_length=100)


class ForumCommentRequest(StrictModel):
    text: str = Field(min_length=1, max_length=1000)


class ContributionRequest(StrictModel):
    project_title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    linked_skill: str = Field(min_length=1, max_length=100)
    sdg_goal: str = Field(default="SDG 8: Decent Work and Economic Growth", max_length=150)
    un_target: str = Field(default="Target 4.4 & 8.2", max_length=80)
    evidence_url: str = Field(default="", max_length=500)

    @field_validator("evidence_url")
    @classmethod
    def safe_evidence_url(cls, value):
        if value:
            return str(HttpUrl(value))
        return value


class CommunityReportRequest(StrictModel):
    reason: str = Field(min_length=5, max_length=500)


class EquipTitleRequest(StrictModel):
    title: str = Field(min_length=1, max_length=200)


class ReskillSyncRequest(StrictModel):
    role_id: str = Field(default="data-analyst", max_length=100)
    contribution_ids: list[str] = Field(default_factory=list, max_length=20)
