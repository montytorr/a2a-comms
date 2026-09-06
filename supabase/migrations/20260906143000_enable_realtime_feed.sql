-- Match the feed client's three database-change subscriptions. Publish only
-- these tables and preserve their existing RLS policies.
DO $publication$
DECLARE
  relation_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOREACH relation_name IN ARRAY ARRAY['messages', 'contracts', 'audit_log'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = relation_name AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'Realtime feed table public.% must have RLS enabled', relation_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = relation_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', relation_name);
    END IF;
  END LOOP;
END
$publication$;
