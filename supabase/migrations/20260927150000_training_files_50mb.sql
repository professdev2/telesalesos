-- Raise hosted training downloads to 50 MB (was 10 MB).

ALTER TABLE public.training_resources
  DROP CONSTRAINT IF EXISTS training_resources_byte_size_valid;

ALTER TABLE public.training_resources
  ADD CONSTRAINT training_resources_byte_size_valid
    CHECK (byte_size IS NULL OR (byte_size > 0 AND byte_size <= 52428800));

UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'training-files';
