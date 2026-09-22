#!/bin/sh
#
# Seed one agent with a usable HMAC key pair, so a fresh install is something
# you can make a signed request against instead of an empty shell.
#
#   DATABASE_URL=postgresql://... ./scripts/seed.sh
#
# Idempotent: run it twice and the second run prints the same credentials back
# rather than minting a second key. It creates exactly what verify-e2e.sh's
# "3. Fixtures" step creates — an agent row plus a service_keys row whose
# key_hash is sha256(signing_secret) — because that is the shape src/lib/hmac.ts
# actually looks up (by key_id) and signs with (signing_secret).
#
# POSIX sh for the same reason as migrate.sh: it runs inside postgres:17-alpine.
#
# Env:
#   DATABASE_URL          required
#   SEED_AGENT_NAME       default: local
#   SEED_AGENT_OWNER      default: owner@example.test
#   SEED_KEY_ID           default: <agent name>-local
#   SEED_SIGNING_SECRET   default: 32 random bytes, hex
#
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "seed: DATABASE_URL is required" >&2
  exit 1
fi

AGENT_NAME="${SEED_AGENT_NAME:-local}"
AGENT_OWNER="${SEED_AGENT_OWNER:-owner@example.test}"
KEY_ID="${SEED_KEY_ID:-${AGENT_NAME}-local}"

psql_val() { psql "$DATABASE_URL" -t -A -v ON_ERROR_STOP=1 "$@"; }
psql_run() { psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 "$@"; }

if [ -z "$(psql_val -c "select to_regclass('public.service_keys')")" ]; then
  echo "seed: schema is not migrated yet — run scripts/migrate.sh first" >&2
  exit 1
fi

EXISTING="$(psql_val -c "select signing_secret from service_keys where key_id = '$KEY_ID'")"

if [ -n "$EXISTING" ]; then
  SECRET="$EXISTING"
else
  if [ -n "${SEED_SIGNING_SECRET:-}" ]; then
    SECRET="$SEED_SIGNING_SECRET"
  elif command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 32)"
  else
    # busybox od is always there; openssl is not guaranteed in every base image.
    SECRET="$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')"
  fi

  # sha256(secret), matching src/lib/agent-lifecycle.ts. Computed in Postgres so
  # this does not depend on a sha256sum/shasum being present in the image.
  HASH="$(psql_val -c "select encode(sha256('$SECRET'::bytea), 'hex')")"

  # The owner_user_id points at the auth.users row migrate.sh's bootstrap seeds,
  # so the agent is reachable from the dashboard's user-scoped queries and not
  # an orphan that every RLS-shaped filter steps over.
  psql_run <<SQL
insert into agents (name, display_name, owner, capabilities, trust_tier, owner_user_id)
values ('$AGENT_NAME', 'Local Agent', '$AGENT_OWNER',
        ARRAY['contracts','projects','tasks'], 'internal',
        'eb1f0989-1b9b-4576-9912-037a7fd298a3')
on conflict (name) do nothing;

insert into service_keys (key_id, key_hash, signing_secret, agent_id, human_owner, label, is_active)
select '$KEY_ID', '$HASH', '$SECRET', id, '$AGENT_OWNER', 'local development key', true
  from agents where name = '$AGENT_NAME';
SQL
fi

AGENT_ID="$(psql_val -c "select id from agents where name = '$AGENT_NAME'")"

cat <<OUT

seed: agent "$AGENT_NAME" ready ($AGENT_ID)

  export HOLLOWAY_BASE_URL=${HOLLOWAY_BASE_URL:-${A2A_BASE_URL:-http://localhost:3100}}
  export HOLLOWAY_API_KEY=$KEY_ID
  export HOLLOWAY_SIGNING_SECRET=$SECRET

Check it with:  holloway health   (skill/scripts/holloway, or python3 skill/scripts/holloway health)
Make that agent an admin by putting its id in HOLLOWAY_ADMIN_AGENT_IDS.
OUT
