from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import JSON, DateTime, ForeignKey, String, UniqueConstraint, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.pool import NullPool
from fastapi import HTTPException
from .config import settings


class Base(DeclarativeBase):
    pass


class OwnedRecord:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class UserProfile(OwnedRecord, Base):
    __tablename__ = "user_profiles"


class Questionnaire(OwnedRecord, Base):
    __tablename__ = "questionnaire_submissions"


class CVProfile(OwnedRecord, Base):
    __tablename__ = "cv_profiles"


class CVEvaluation(OwnedRecord, Base):
    __tablename__ = "cv_evaluations"


class UserSkill(OwnedRecord, Base):
    __tablename__ = "user_skills"


class CareerMatch(OwnedRecord, Base):
    __tablename__ = "career_matches"


class LearningPlan(OwnedRecord, Base):
    __tablename__ = "learning_plans"


class ConsentEvent(OwnedRecord, Base):
    __tablename__ = "consent_events"


class HostedCourse(OwnedRecord, Base):
    __tablename__ = "hosted_courses"


class CourseEnrollment(OwnedRecord, Base):
    __tablename__ = "course_enrollments"
    course_id: Mapped[str] = mapped_column(String(100))
    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_course_enrollment_owner"),)


class CourseAttempt(OwnedRecord, Base):
    __tablename__ = "course_attempts"


class SDGContribution(OwnedRecord, Base):
    __tablename__ = "sdg_contributions"
    __table_args__ = (UniqueConstraint("user_id", "dedupe_key"),)
    dedupe_key: Mapped[str] = mapped_column(String(64))


class SDGTrackerState(OwnedRecord, Base):
    __tablename__ = "sdg_tracker_state"
    __table_args__ = (UniqueConstraint("user_id"),)


class CommunityPost(OwnedRecord, Base):
    __tablename__ = "community_posts"


class CommunityComment(OwnedRecord, Base):
    __tablename__ = "community_comments"
    post_id: Mapped[str] = mapped_column(ForeignKey("community_posts.id", ondelete="CASCADE"), index=True)


class CommunityLike(Base):
    __tablename__ = "community_likes"
    post_id: Mapped[str] = mapped_column(ForeignKey("community_posts.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), primary_key=True)


class CommunityReport(OwnedRecord, Base):
    __tablename__ = "community_reports"
    __table_args__ = (UniqueConstraint("user_id", "post_id"),)
    post_id: Mapped[str] = mapped_column(ForeignKey("community_posts.id", ondelete="CASCADE"), index=True)


def async_url(url):
    return url.replace("postgres://", "postgresql+asyncpg://", 1).replace(
        "postgresql://", "postgresql+asyncpg://", 1
    )


engine = (
    create_async_engine(
        async_url(settings.database_url),
        poolclass=NullPool,
        pool_pre_ping=True,
        connect_args={"ssl": "require", "statement_cache_size": 0, "prepared_statement_cache_size": 0},
    )
    if settings.database_url
    else None
)
Session = async_sessionmaker(engine, expire_on_commit=False) if engine else None


async def get_db():
    if Session is None:
        raise HTTPException(
            503,
            "Database is not configured. Fill DATABASE_URL in the root .env, then restart the API. Demo profiles remain available.",
        )
    async with Session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def records(db: AsyncSession, model, user_id):
    result = await db.scalars(select(model).where(model.user_id == user_id).order_by(model.created_at.desc()))
    return list(result)


async def latest(db, model, user_id):
    return await db.scalar(select(model).where(model.user_id == user_id).order_by(model.created_at.desc()).limit(1))


async def save(db, model, user_id, payload, record_id=None):
    row = (
        await db.scalar(select(model).where(model.user_id == user_id, model.id == record_id))
        if record_id
        else await latest(db, model, user_id)
    )
    if row:
        row.payload = payload
    else:
        row = model(user_id=user_id, payload=payload)
        db.add(row)
    await db.flush()
    return row
