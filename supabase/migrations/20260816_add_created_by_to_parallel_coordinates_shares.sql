-- Align parallel_coordinates_shares with the saved-project publish model:
-- record created_by from the publish Edge Function JWT subject.

ALTER TABLE public.parallel_coordinates_shares
  ADD COLUMN IF NOT EXISTS created_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'parallel_coordinates_shares_created_by_fkey'
  ) THEN
    ALTER TABLE public.parallel_coordinates_shares
      ADD CONSTRAINT parallel_coordinates_shares_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;
