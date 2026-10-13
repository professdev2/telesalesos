-- Training v2: hosted lesson downloads (scripts/PDFs) in private Storage.
-- Paths: platform/{course_id}/{lesson_id}/{file}
--        {organization_id}/{course_id}/{lesson_id}/{file}

-- 1) Resource rows: link (external HTTPS) or file (storage path)
ALTER TABLE public.training_resources
  DROP CONSTRAINT IF EXISTS training_resources_url_valid;

ALTER TABLE public.training_resources
  ADD COLUMN source text NOT NULL DEFAULT 'link'
    CONSTRAINT training_resources_source_valid
      CHECK (source IN ('link', 'file')),
  ADD COLUMN storage_path text
    CONSTRAINT training_resources_storage_path_length
      CHECK (storage_path IS NULL OR length(storage_path) BETWEEN 1 AND 512),
  ADD COLUMN content_type text
    CONSTRAINT training_resources_content_type_length
      CHECK (content_type IS NULL OR length(content_type) BETWEEN 1 AND 120),
  ADD COLUMN byte_size bigint
    CONSTRAINT training_resources_byte_size_valid
      CHECK (byte_size IS NULL OR (byte_size > 0 AND byte_size <= 10485760));

ALTER TABLE public.training_resources
  ALTER COLUMN url DROP NOT NULL;

ALTER TABLE public.training_resources
  ADD CONSTRAINT training_resources_source_shape CHECK (
    (
      source = 'link'
      AND url IS NOT NULL
      AND length(url) <= 2048
      AND url ~ '^https://'
      AND storage_path IS NULL
    )
    OR
    (
      source = 'file'
      AND storage_path IS NOT NULL
      AND url IS NULL
    )
  );

COMMENT ON COLUMN public.training_resources.source IS
  'link = external HTTPS URL; file = object in training-files bucket.';
COMMENT ON COLUMN public.training_resources.storage_path IS
  'Object path inside bucket training-files. Null for external links.';

-- 2) Private bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-files',
  'training-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3) Storage RLS
-- Path segment 1 = 'platform' or organization uuid.

CREATE POLICY training_files_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'training-files'
    AND (
      (storage.foldername(name))[1] = 'platform'
      OR EXISTS (
        SELECT 1
        FROM public.organization_memberships m
        WHERE m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.organization_id::text = (storage.foldername(name))[1]
      )
    )
  );

CREATE POLICY training_files_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'training-files'
    AND (
      (
        (storage.foldername(name))[1] = 'platform'
        AND private.is_platform_admin()
      )
      OR (
        (storage.foldername(name))[1] <> 'platform'
        AND private.has_org_role(
          ((storage.foldername(name))[1])::uuid,
          ARRAY['owner', 'admin']::text[],
          auth.uid()
        )
      )
    )
  );

CREATE POLICY training_files_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'training-files'
    AND (
      (
        (storage.foldername(name))[1] = 'platform'
        AND private.is_platform_admin()
      )
      OR (
        (storage.foldername(name))[1] <> 'platform'
        AND private.has_org_role(
          ((storage.foldername(name))[1])::uuid,
          ARRAY['owner', 'admin']::text[],
          auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'training-files'
    AND (
      (
        (storage.foldername(name))[1] = 'platform'
        AND private.is_platform_admin()
      )
      OR (
        (storage.foldername(name))[1] <> 'platform'
        AND private.has_org_role(
          ((storage.foldername(name))[1])::uuid,
          ARRAY['owner', 'admin']::text[],
          auth.uid()
        )
      )
    )
  );

CREATE POLICY training_files_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'training-files'
    AND (
      (
        (storage.foldername(name))[1] = 'platform'
        AND private.is_platform_admin()
      )
      OR (
        (storage.foldername(name))[1] <> 'platform'
        AND private.has_org_role(
          ((storage.foldername(name))[1])::uuid,
          ARRAY['owner', 'admin']::text[],
          auth.uid()
        )
      )
    )
  );
