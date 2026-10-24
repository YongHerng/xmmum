"""Persistent practice logs, progress preferences and authenticated community."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

OWNED = ["sdg_contributions", "sdg_tracker_state", "community_posts", "community_comments", "community_reports"]


def upgrade():
    for table in OWNED:
        extra = []
        if table == "sdg_contributions":
            extra = [sa.Column("dedupe_key", sa.String(64), nullable=False), sa.UniqueConstraint("user_id", "dedupe_key", name="uq_sdg_contribution_project")]
        if table == "sdg_tracker_state":
            extra = [sa.UniqueConstraint("user_id", name="uq_sdg_tracker_user")]
        if table in ("community_comments", "community_reports"):
            extra = [sa.Column("post_id", sa.String(36), sa.ForeignKey("community_posts.id", ondelete="CASCADE"), nullable=False)]
        if table == "community_reports":
            extra += [sa.UniqueConstraint("user_id", "post_id", name="uq_community_report_user_post")]
        op.create_table(table,
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), nullable=False),
            sa.Column("payload", JSONB(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            *extra,
        )
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])
        if table in ("community_comments", "community_reports"):
            op.create_index(f"ix_{table}_post_id", table, ["post_id"])
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"REVOKE ALL ON public.{table} FROM anon, authenticated")
        if table.startswith("sdg_"):
            op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON public.{table} TO authenticated")
            op.execute(f"CREATE POLICY own_records ON public.{table} FOR ALL TO authenticated USING ((select auth.uid())::text = user_id) WITH CHECK ((select auth.uid())::text = user_id)")
        elif table != "community_reports":
            # Shared reads; authorship and writes go through the authenticated API.
            op.execute(f"GRANT SELECT ON public.{table} TO authenticated")
            op.execute(f"CREATE POLICY community_read ON public.{table} FOR SELECT TO authenticated USING (true)")
    op.create_table("community_likes",
        sa.Column("post_id", sa.String(36), sa.ForeignKey("community_posts.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.String(36), primary_key=True),
    )
    op.execute("ALTER TABLE public.community_likes ENABLE ROW LEVEL SECURITY")
    op.execute("REVOKE ALL ON public.community_likes FROM anon, authenticated")
    # Individual likes and private reports are accessible only through the API/owner connection.


def downgrade():
    op.drop_table("community_likes")
    for table in reversed(OWNED):
        op.drop_table(table)
