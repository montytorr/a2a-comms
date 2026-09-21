#!/usr/bin/env bash
# Prove that the migrations in this repo build the schema that is actually
# running, and say exactly where they disagree.
#
# WHY THIS EXISTS. Migrations reach production by hand, so the ledger and the
# live database drift apart silently. Three instances in two days:
#
#   pending_approvals.status        the app wrote 'consumed'; the CHECK refused
#                                   it, and the db client turns a constraint
#                                   violation into {data:null,error} rather than
#                                   throwing, so the kill switch would have been
#                                   left half-applied
#   webhook_deliveries.status       production widened by hand for the retry
#                                   worker; a fresh deploy would have silently
#                                   stopped retrying failed deliveries
#   reputation_ledger_events        production widened by hand for a feature
#                                   that was never built
#
# None of these could be seen by reading either side alone. A schema_migrations
# ledger would not have caught any of them either: the question is not "which
# files ran" but "does the result match".
#
# HOW: build a database from the migrations alone in a throwaway container,
# describe both schemas in a normalised, diffable form, and compare.
#
#   ./scripts/verify-schema.sh                    compare against production
#   ./scripts/verify-schema.sh --against <url>    compare against any database
#   ./scripts/verify-schema.sh --snapshot         write docs/schema.txt
#
# Extension-owned functions are excluded: pgcrypto and amcheck exist in
# production and not in a bare container, which is a property of the host
# rather than a disagreement about this repo's schema.
set -euo pipefail
cd "$(dirname "$0")/.."

DOCKER="docker"; docker info >/dev/null 2>&1 || DOCKER="sudo docker"
CONTAINER="a2a-schema-verify-$$"
PORT="${SCHEMA_VERIFY_PORT:-55445}"
MODE="${1:---against-production}"

cleanup() { $DOCKER rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# The shape query. Ordered and normalised so a diff is about the schema and not
# about how postgres felt like printing it.
read -r -d '' SHAPE <<'SQL' || true
SELECT 'column|' || c.table_name || '|' || c.column_name || '|' || c.data_type ||
       '|' || coalesce(c.column_default,'-') || '|' || c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
  AND c.table_name <> 'schema_migrations'
UNION ALL
SELECT 'constraint|' || conrelid::regclass::text || '|' || conname || '|' || pg_get_constraintdef(oid)
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conrelid::regclass::text <> 'schema_migrations'
UNION ALL
SELECT 'index|' || tablename || '|' || indexname || '|' || indexdef
FROM pg_indexes WHERE schemaname = 'public' AND tablename <> 'schema_migrations'
UNION ALL
-- OWNERSHIP, not just shape. On 2026-09-18 the operator-channel migration was
-- applied to production by hand as `postgres` instead of through migrate.sh as
-- the application role. The tables came out with the right columns, the right
-- constraints and the right indexes — and an owner the app is not, and no
-- grants. src/lib/db/client.ts turns "permission denied" into
-- { data: null, error }, so every read returned empty and every contract said
-- "no notes" for three days. This check compared shape only and passed it.
SELECT 'owner|' || c.relname || '|' || pg_get_userbyid(c.relowner)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname <> 'schema_migrations'
UNION ALL
SELECT 'function|' || p.proname || '|' || pg_get_function_identity_arguments(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
WHERE n.nspname = 'public' AND d.objid IS NULL
ORDER BY 1;
SQL

echo "building a database from the migrations alone…"
$DOCKER run -d --name "$CONTAINER" \
  -e POSTGRES_USER=a2a_app -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=a2a \
  -p "$PORT:5432" postgres:17.11-alpine >/dev/null
for _ in $(seq 1 40); do
  $DOCKER exec "$CONTAINER" pg_isready -U a2a_app -d a2a >/dev/null 2>&1 && break
  sleep 2
done

DATABASE_URL="postgresql://a2a_app:verify@localhost:$PORT/a2a" ./scripts/migrate.sh >/dev/null
FROM_MIGRATIONS="$(mktemp)"
printf '%s' "$SHAPE" | $DOCKER exec -i "$CONTAINER" psql -U a2a_app -d a2a -t -A -P pager=off | sort -u > "$FROM_MIGRATIONS"
echo "  $(wc -l < "$FROM_MIGRATIONS") schema objects"

if [[ "$MODE" == "--snapshot" ]]; then
  cp "$FROM_MIGRATIONS" docs/schema.txt
  echo "wrote docs/schema.txt — commit it so a change to the schema shows up in a diff"
  exit 0
fi

RUNNING="$(mktemp)"
if [[ "$MODE" == "--against" ]]; then
  printf '%s' "$SHAPE" | psql "${2:?--against needs a connection string}" -t -A -P pager=off | sort -u > "$RUNNING"
  LABEL="$2"
else
  printf '%s' "$SHAPE" | $DOCKER exec -i "${A2A_DB_CONTAINER:-clawdius-postgres}" \
    psql -U postgres -d "${A2A_DB_NAME:-a2a}" -t -A -P pager=off | sort -u > "$RUNNING"
  LABEL="production"
fi
echo "  $(wc -l < "$RUNNING") in $LABEL"

ONLY_RUNNING="$(comm -13 "$FROM_MIGRATIONS" "$RUNNING")"
ONLY_LEDGER="$(comm -23 "$FROM_MIGRATIONS" "$RUNNING")"

status=0
if [[ -n "$ONLY_RUNNING" ]]; then
  echo
  echo "IN $LABEL BUT NO MIGRATION PRODUCES IT — applied by hand, never written down:"
  printf '%s\n' "$ONLY_RUNNING" | sed 's/^/  /'
  status=1
fi
if [[ -n "$ONLY_LEDGER" ]]; then
  echo
  echo "THE MIGRATIONS PRODUCE IT BUT $LABEL DOES NOT HAVE IT — never applied:"
  printf '%s\n' "$ONLY_LEDGER" | sed 's/^/  /'
  status=1
fi
[[ "$status" -eq 0 ]] && echo && echo "the migrations and $LABEL agree."
exit "$status"
