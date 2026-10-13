-- Training v2 catalog slice (Jake: thumbnails + sections).
-- Thumbnail is an HTTPS image URL for now; Supabase Storage uploads come next.
-- Section groups courses on /training (Televersity-style catalog).

ALTER TABLE public.training_courses
  ADD COLUMN section text
    CONSTRAINT training_courses_section_length
      CHECK (section IS NULL OR length(trim(section)) BETWEEN 1 AND 80),
  ADD COLUMN thumbnail_url text
    CONSTRAINT training_courses_thumbnail_url_valid
      CHECK (
        thumbnail_url IS NULL
        OR (
          length(thumbnail_url) <= 2048
          AND thumbnail_url ~ '^https://'
        )
      );

COMMENT ON COLUMN public.training_courses.section IS
  'Optional catalog section label (e.g. Product Training, Live Calls). Null = General.';
COMMENT ON COLUMN public.training_courses.thumbnail_url IS
  'Optional HTTPS image URL for the catalog card. File upload to Storage is a later slice.';

CREATE INDEX training_courses_section_idx
  ON public.training_courses (visibility, organization_id, section, created_at DESC);
