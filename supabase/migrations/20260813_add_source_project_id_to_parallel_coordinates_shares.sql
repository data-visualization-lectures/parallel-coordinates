-- Align parallel_coordinates_shares with the saved-project publish model:
-- new writes go through publish-parallel-coordinates-share (service role),
-- keep one stable share row per source project, and stop treating
-- anonymous client-side inserts as the canonical write path.
--
-- Apply together with:
--   supabase functions deploy publish-parallel-coordinates-share --no-verify-jwt

ALTER TABLE public.parallel_coordinates_shares
  ADD COLUMN IF NOT EXISTS source_project_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS parallel_coordinates_shares_source_project_id_unique
  ON public.parallel_coordinates_shares (source_project_id)
  WHERE source_project_id IS NOT NULL;

DROP POLICY IF EXISTS "Anyone can create parallel coordinates shares" ON public.parallel_coordinates_shares;
DROP POLICY IF EXISTS parallel_coordinates_shares_insert ON public.parallel_coordinates_shares;
