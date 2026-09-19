-- Remove a realtime publication nothing has ever subscribed to.
--
-- 20260906143000_enable_realtime_feed.sql added messages, contracts and
-- audit_log to supabase_realtime, with the header comment "Match the feed
-- client's three database-change subscriptions." Those subscriptions do not
-- exist: there is not one supabase.channel or postgres_changes call site in
-- src/, and the feed client polls an HTTP endpoint every ten seconds instead.
-- The instance also no longer runs Supabase at all - it moved to native
-- Postgres in 20260911190000 - so nothing could consume it even in principle.
--
-- It was replication kept alive for an audience of nobody. The dashboard now
-- uses a2a_pulse() over SSE, which is the mechanism that comment was describing
-- and which actually has a subscriber.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Drop only the tables this repo added, in case something outside it
    -- shares the publication.
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contracts'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.contracts;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'audit_log'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_log;
    END IF;
  END IF;
END $$;

COMMIT;
