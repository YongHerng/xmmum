"""Prototype owned data with RLS. Does not modify auth schema."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "001"
down_revision = None
branch_labels = None
depends_on = None
TABLES = [
    "user_profiles",
    "questionnaire_submissions",
    "cv_profiles",
    "cv_evaluations",
    "user_skills",
    "career_matches",
    "learning_plans",
    "consent_events",
]


def upgrade():
    for table in TABLES:
        op.create_table(
            table,
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("payload", JSONB(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        if table in [
            "user_profiles",
            "questionnaire_submissions",
            "cv_profiles",
            "cv_evaluations",
            "career_matches",
        ]:
            op.create_unique_constraint(f"uq_{table}_user", table, ["user_id"])
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON public.{table} FROM anon")
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated")
        op.execute(
            f"CREATE POLICY own_records ON public.{table} FOR ALL TO authenticated USING ((select auth.uid())::text = user_id) WITH CHECK ((select auth.uid())::text = user_id)"
        )


def downgrade():
    for table in reversed(TABLES):
        op.drop_table(table)
