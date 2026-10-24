"""Hosted course catalogue, enrollments and assessment history."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('hosted_courses', 'course_enrollments', 'course_attempts'):
        extra = [sa.Column('course_id', sa.String(100), nullable=False)] if table == 'course_enrollments' else []
        op.create_table(table,
                        sa.Column('id', sa.String(36), primary_key=True),
                        sa.Column('user_id', sa.String(36), nullable=False),
                        sa.Column('payload', JSONB(), nullable=False),
                        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
                        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), *extra)
        op.create_index(f'ix_{table}_user_id', table, ['user_id'])
        if extra:
            op.create_unique_constraint('uq_course_enrollment_owner', table, ['user_id', 'course_id'])
        op.execute(f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY')
        # Mutations go through FastAPI grading/ownership checks, not client SQL.
        op.execute(f'REVOKE ALL ON public.{table} FROM anon, authenticated')
        op.execute(f'GRANT SELECT ON public.{table} TO authenticated')
        condition = "(select auth.uid())::text = user_id"
        # Course answer keys remain owner-only even after publishing. Learners
        # receive sanitized catalogue/quiz data through the backend API instead.
        op.execute(f'CREATE POLICY read_learning ON public.{table} FOR SELECT TO authenticated USING ({condition})')


def downgrade():
    for table in ('course_attempts', 'course_enrollments', 'hosted_courses'):
        op.drop_table(table)


