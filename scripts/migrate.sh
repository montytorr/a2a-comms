#!/bin/sh
#
# Apply supabase/migrations/*.sql in filename order against $DATABASE_URL.
#
# Until this existed there was no runner anywhere: 49 migration files and the
# only thing that had ever applied them in order was scripts/verify-e2e.sh,
# inside its own throwaway container, as one step of a much larger test. A new
# deployment had to be built by hand from that script's middle. This is that
# step, lifted out and made re-runnable — same bootstrap, same ordering, same
# `ON_ERROR_STOP=1` per file, plus a ledger so a second run is a no-op.
#
#   DATABASE_URL=postgresql://... ./scripts/migrate.sh
#
# Written in POSIX sh, not bash, because the compose stack runs it inside the
# postgres:17-alpine image (which has psql and no bash) rather than building a
# second image just to hold a client.
#
# Env:
#   DATABASE_URL     required — libpq URL of the target database
#   MIGRATIONS_DIR   default: <repo>/supabase/migrations
#   MIGRATE_WAIT     seconds to wait for the server to accept connections (60)
#
set -eu

if [ -z "${DATABASE_URL:-}" ] && [ -z "${A2A_DB_CONTAINER:-}" ]; then
  echo "migrate: set DATABASE_URL, or A2A_DB_CONTAINER to reach a database only docker can see" >&2
  exit 1
fi

# Resolve the default migrations directory relative to this script, so the
# runner works from any cwd and from inside a container that mounts it.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$SCRIPT_DIR/../supabase/migrations}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "migrate: no migrations directory at $MIGRATIONS_DIR" >&2
  exit 1
fi

# Two ways to reach the database, because the two callers are different.
#
# A newcomer has a DATABASE_URL they can dial directly. The deploy does not:
# production's DATABASE_URL names `clawdius-postgres`, a docker-network
# hostname the HOST cannot resolve, and ci-deploy.sh runs on the host. So it
# passes A2A_DB_CONTAINER instead and psql runs inside the container, which is
# how every other script here already reaches it (contract-expiry-sweep.sh).
if [ -n "${A2A_DB_CONTAINER:-}" ]; then
  DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
  DB_USER="${A2A_DB_USER:-postgres}"
  DB_NAME="${A2A_DB_NAME:-a2a}"
  psql_run() { $DOCKER exec -i "$A2A_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -q -v ON_ERROR_STOP=1 "$@"; }
  psql_val() { $DOCKER exec -i "$A2A_DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -v ON_ERROR_STOP=1 "$@"; }
else
  psql_run() { psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 "$@"; }
  psql_val() { psql "$DATABASE_URL" -t -A -v ON_ERROR_STOP=1 "$@"; }
fi

# ------------------------------------------------------------------ wait ---
# The compose healthcheck already gates on pg_isready, but this script is also
# run by hand against a server that may still be starting. pg_isready alone is
# not enough for a *fresh* postgres container: initdb runs a temporary server on
# the unix socket while it applies POSTGRES_* and any entrypoint scripts, and
# work done against that one is discarded when it shuts down. Connecting over
# TCP, as we do here, only ever reaches the real server, so a successful
# `select 1` is the honest signal.
WAIT="${MIGRATE_WAIT:-60}"
i=0
while [ "$i" -lt "$WAIT" ]; do
  if psql_val -c 'select 1' >/dev/null 2>&1; then break; fi
  i=$((i + 1))
  sleep 1
done
if ! psql_val -c 'select 1' >/dev/null 2>&1; then
  echo "migrate: database did not accept connections within ${WAIT}s" >&2
  exit 1
fi

# ------------------------------------------------------------- bootstrap ---
# The early migrations predate the move off Supabase (20260911190000) and still
# reference auth.* and Supabase's three roles. Nothing recreates them on native
# Postgres, so 001 fails at 'role "authenticated" does not exist' without this.
# Lifted verbatim from verify-e2e.sh's bootstrap and made re-runnable.
#
# ONLY ON AN EMPTY DATABASE. It creates an auth schema and SEEDS TWO TEST USERS
# that 005_user_scoping.sql needs by hardcoded id — which belongs in a fresh
# database and absolutely does not belong in a live one. A database that already
# has `contracts` has been through this once; it needs the ledger table and
# nothing else.
ALREADY_BUILT="$(psql_val -c "select 1 from information_schema.tables where table_schema='public' and table_name='contracts'")"
if [ "$ALREADY_BUILT" = "1" ]; then
  echo "migrate: existing database — skipping the fresh-install bootstrap" >&2
  psql_run >/dev/null <<'SQL'
set client_min_messages = warning;
create table if not exists schema_migrations (
  version     text primary key,
  checksum    text,
  applied_at  timestamptz not null default now()
);
SQL
else
psql_run >/dev/null <<'SQL'
-- Everything below is guarded with if-not-exists, so on every run after the
-- first it would otherwise print a screenful of NOTICEs about work it correctly
-- declined to do, and bury the one line that matters.
set client_min_messages = warning;
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
create or replace function auth.uid()  returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt()  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb, banned_until timestamptz, deleted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now());
-- 005_user_scoping.sql seeds two profiles by hardcoded id and needs them to exist.
insert into auth.users (id, email, encrypted_password) values
  ('eb1f0989-1b9b-4576-9912-037a7fd298a3','seed-a@example.test','x'),
  ('d80083d8-4b17-4052-90fd-f2cb91fbff06','seed-b@example.test','x')
on conflict (id) do nothing;

create table if not exists schema_migrations (
  version     text primary key,
  checksum    text,
  applied_at  timestamptz not null default now()
);
SQL
fi

# --------------------------------------------------------------- migrate ---
APPLIED=0
SKIPPED=0

# LC_ALL=C so the sort is plain byte order on every host: '0' < '2' puts the
# three-digit 001..007 files ahead of the 2026* timestamps, which is the order
# they were written in and the only order they apply in.
for f in $(LC_ALL=C ls "$MIGRATIONS_DIR"/*.sql | LC_ALL=C sort); do
  version="$(basename "$f")"

  already="$(psql_val -c "select 1 from schema_migrations where version = '$version'")"
  if [ "$already" = "1" ]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    checksum="$(sha256sum "$f" | cut -d' ' -f1)"
  else
    checksum=""
  fi

  # No --single-transaction: several migrations (007_tighten_rls.sql,
  # 20260918150000_dashboard_pulse.sql) open their own BEGIN;/COMMIT;, and
  # wrapping those would have the inner COMMIT close the outer block early.
  # This is exactly how verify-e2e.sh applies them, which is the one path
  # known to get all 49 through.
  if ! psql_run < "$f" >/dev/null 2>"/tmp/migrate.$$.log"; then
    echo "migrate: $version FAILED" >&2
    sed 's/^/  /' "/tmp/migrate.$$.log" >&2
    rm -f "/tmp/migrate.$$.log"
    exit 1
  fi
  rm -f "/tmp/migrate.$$.log"

  psql_run -c "insert into schema_migrations (version, checksum) values ('$version', nullif('$checksum',''))" >/dev/null
  echo "  applied  $version"
  APPLIED=$((APPLIED + 1))
done

echo "migrate: $APPLIED applied, $SKIPPED already present ($((APPLIED + SKIPPED)) total)"
