"""Private learning files authorized by user sessions, not a shared secret key.

Helpers return booleans only from an unexposed schema. They do not grant
learners SELECT on course JSON, which contains protected answer keys.
"""
from alembic import op

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None

BUCKET = 'learning-materials'

READ_FUNCTION = r"""
CREATE FUNCTION learning_private.can_read_material(object_bucket text, object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND object_bucket = 'learning-materials'
    AND object_name ~ '^courses/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{32}\.(pdf|mp4|webm)$'
    AND EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = object_bucket AND NOT b.public)
    AND EXISTS (
      SELECT 1 FROM public.hosted_courses c
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.payload->'chapters','[]'::jsonb)) chapter
      WHERE c.id = split_part(object_name,'/',2)
        AND chapter->>'id' = split_part(object_name,'/',3)
        AND COALESCE(c.payload->>'deleted_at','') = ''
        AND (
          c.user_id = (SELECT auth.uid())::text
          OR (
            c.payload->>'published' = 'true'
            AND EXISTS (SELECT 1 FROM public.course_enrollments e
                        WHERE e.course_id = c.id AND e.user_id = (SELECT auth.uid())::text)
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(chapter->'materials','[]'::jsonb)) material
              WHERE material->>'storage_provider' = 'supabase'
                AND material->>'storage_bucket' = object_bucket
                AND material->>'storage_path' = object_name
                AND COALESCE(material->>'removed_at','') = ''
                AND (COALESCE(material->>'subsection_id','') = '' OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(COALESCE(chapter->'subsections','[]'::jsonb)) subsection
                  WHERE subsection->>'id' = material->>'subsection_id'
                    AND COALESCE(subsection->>'removed_at','') = ''
                ))
            )
          )
        )
    )
$function$
"""

WRITE_FUNCTION = r"""
CREATE FUNCTION learning_private.can_write_material(object_bucket text, object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND object_bucket = 'learning-materials'
    AND object_name ~ '^courses/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{32}\.(pdf|mp4|webm)$'
    AND EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = object_bucket AND NOT b.public)
    AND EXISTS (
      SELECT 1 FROM public.hosted_courses c
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.payload->'chapters','[]'::jsonb)) chapter
      WHERE c.id = split_part(object_name,'/',2)
        AND chapter->>'id' = split_part(object_name,'/',3)
        AND c.user_id = (SELECT auth.uid())::text
        AND c.payload->>'published' = 'false'
        AND COALESCE(c.payload->>'deleted_at','') = ''
    )
$function$
"""


def upgrade():
    # Storage buckets/objects are managed through the Storage API, not direct
    # SQL inserts. This only adds access policies to the existing private bucket.
    op.execute('CREATE SCHEMA IF NOT EXISTS learning_private')
    op.execute('REVOKE ALL ON SCHEMA learning_private FROM PUBLIC')
    op.execute('GRANT USAGE ON SCHEMA learning_private TO anon, authenticated')
    op.execute(READ_FUNCTION)
    op.execute(WRITE_FUNCTION)
    for function in ('can_read_material', 'can_write_material'):
        op.execute(f'REVOKE ALL ON FUNCTION learning_private.{function}(text,text) FROM PUBLIC')
        op.execute(f'GRANT EXECUTE ON FUNCTION learning_private.{function}(text,text) TO anon, authenticated')
    op.execute("CREATE POLICY learning_bucket_metadata ON storage.buckets FOR SELECT TO authenticated USING (id = 'learning-materials' AND NOT public)")
    for action, helper in (('SELECT','can_read_material'), ('INSERT','can_write_material'), ('DELETE','can_write_material')):
        clause = 'WITH CHECK' if action == 'INSERT' else 'USING'
        name = action.lower()
        condition = f"bucket_id = '{BUCKET}' AND learning_private.{helper}(bucket_id,name)"
        op.execute(f'CREATE POLICY learning_files_{name} ON storage.objects FOR {action} TO authenticated {clause} ({condition})')
        # These guards also block a future broad policy from exposing this
        # bucket, without changing access to unrelated buckets.
        guard = f"bucket_id <> '{BUCKET}' OR learning_private.{helper}(bucket_id,name)"
        op.execute(f'CREATE POLICY learning_files_{name}_guard ON storage.objects AS RESTRICTIVE FOR {action} TO PUBLIC {clause} ({guard})')
    op.execute(f"CREATE POLICY learning_files_no_overwrite ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING (bucket_id <> '{BUCKET}') WITH CHECK (bucket_id <> '{BUCKET}')")


def downgrade():
    op.execute('DROP POLICY IF EXISTS learning_bucket_metadata ON storage.buckets')
    for policy in ('learning_files_select','learning_files_insert','learning_files_delete',
                   'learning_files_select_guard','learning_files_insert_guard','learning_files_delete_guard','learning_files_no_overwrite'):
        op.execute(f'DROP POLICY IF EXISTS {policy} ON storage.objects')
    op.execute('DROP FUNCTION IF EXISTS learning_private.can_read_material(text,text)')
    op.execute('DROP FUNCTION IF EXISTS learning_private.can_write_material(text,text)')
    # Do not drop buckets, objects or the potentially shared schema.
