#!/usr/bin/env bash
#
# End-to-end verification against a throwaway database.
#
# The test suite is all pure-function unit tests, and CI runs no migrations, so
# nothing otherwise checks that the migrations still apply, that the app boots
# against the resulting schema, or that a signed CLI request reaches a route and
# comes back correct. This does all three, then destroys everything it made.
#
# It never touches production: its own postgres container, its own port, its own
# attachment directory. Run it before shipping anything that changes migrations,
# the HMAC path, or the contract/task/attachment routes.
#
#   npx next build && ./scripts/verify-e2e.sh
#
# It serves the existing .next build rather than making its own, so a stale
# build silently serves yesterday's routes and a new one answers 404 with no
# hint why. The preflight below refuses to run rather than let that happen.
#
set -uo pipefail

# Some hosts need sudo for the docker socket; prefer plain docker when it works.
if docker info >/dev/null 2>&1; then
  DOCKER="docker"
elif sudo -n docker info >/dev/null 2>&1; then
  DOCKER="sudo docker"
else
  echo "cannot reach the docker daemon (tried docker and sudo -n docker)" >&2
  exit 1
fi

# A build newer than every source file, or the run is not testing this checkout.
if [[ ! -f .next/BUILD_ID ]]; then
  echo "no .next build to serve — run 'npx next build' first" >&2
  exit 1
fi
for p in "${E2E_APP_PORT:-3112}" "${E2E_PG_PORT:-55998}"; do
  if port_busy "$p"; then
    echo "port $p is already in use — something else would answer instead of this run" >&2
    echo "(find it with: ss -lptn 'sport = :$p')" >&2
    exit 1
  fi
done

NEWER="$(find src supabase/migrations skill/scripts -newer .next/BUILD_ID -type f -print -quit 2>/dev/null)"
if [[ -n "$NEWER" ]]; then
  echo "the .next build is older than $NEWER — run 'npx next build' first" >&2
  echo "(serving a stale build makes a new route answer 404 for no visible reason)" >&2
  exit 1
fi

PG_CONTAINER="a2a-e2e-pg-$$"
PG_PORT="${E2E_PG_PORT:-55998}"
APP_PORT="${E2E_APP_PORT:-3112}"
WORK="$(mktemp -d)"
APP_PID=""
PASS=0
FAIL=0

cleanup() {
  # Kill the whole process group. `next start` is a wrapper around a child
  # server; killing only the wrapper leaves that child holding the port, and
  # the next run then health-checks a server built from an older checkout and
  # reports its routes as missing. That happened, for a day and a half.
  [[ -n "$APP_PID" ]] && { kill -TERM -"$APP_PID" 2>/dev/null || kill "$APP_PID" 2>/dev/null; }
  $DOCKER rm -f "$PG_CONTAINER" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null && { exec 3<&-; exec 3>&-; return 0; }; return 1; }

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$*"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$*"; }
check(){ if [[ "$2" == *"$3"* ]]; then ok "$1"; else bad "$1 — expected to contain '$3', got: ${2:0:160}"; fi; }

psql_q() { $DOCKER exec -i "$PG_CONTAINER" psql -U a2a_app -d a2a -t -A "$@"; }

# ---------------------------------------------------------------- database ---
say "1. Throwaway postgres"
$DOCKER run -d --rm --name "$PG_CONTAINER" \
  -e POSTGRES_PASSWORD=e2e -e POSTGRES_USER=a2a_app -e POSTGRES_DB=a2a \
  -p "127.0.0.1:$PG_PORT:5432" postgres:17.11-alpine >/dev/null || { echo "docker run failed"; exit 1; }
# Report readiness honestly. This loop used to fall through to `ok` when it
# exhausted, so a slow start (a cold image pull, say) was announced as success
# and then surfaced as a baffling migration error: psql inside a container whose
# server was not listening yet.
#
# pg_isready alone is not enough. The postgres image runs a temporary server on
# the unix socket while initdb applies POSTGRES_* and any entrypoint scripts,
# and pg_isready answers yes to that one. Work done against it is discarded when
# it shuts down, so an early bootstrap either vanished ('role "authenticated"
# does not exist' at migration 001) or hit the shutdown window mid-connection.
# The log line below is printed only once initdb is finished, so wait for it
# first and only then poll.
PG_READY=""
for _ in $(seq 1 60); do
  if $DOCKER logs "$PG_CONTAINER" 2>&1 | grep -q 'database system is ready to accept connections' &&
     $DOCKER logs "$PG_CONTAINER" 2>&1 | grep -q 'PostgreSQL init process complete'; then
    $DOCKER exec "$PG_CONTAINER" pg_isready -U a2a_app -d a2a >/dev/null 2>&1 && { PG_READY=1; break; }
  fi
  sleep 1
done
if [[ -z "$PG_READY" ]]; then
  bad "postgres never became ready on $PG_PORT after 60s"
  echo
  echo "1 check failed before anything could run." >&2
  exit 1
fi
ok "postgres up on $PG_PORT"

# The migrations predate the move off Supabase and still reference auth.*.
# Its failure used to be discarded, which is how a lost bootstrap turned into a
# migration error naming a role nobody had asked for.
if ! $DOCKER exec -i "$PG_CONTAINER" psql -U a2a_app -d a2a -q -v ON_ERROR_STOP=1 >"$WORK/bootstrap.log" 2>&1 <<'SQL'
-- RLS policies in the early migrations grant to Supabase's roles.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;
create schema if not exists auth;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
create or replace function auth.uid()  returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt()  returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb, banned_until timestamptz, deleted_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now());
-- 005_user_scoping.sql seeds two profiles by hardcoded id and needs them to exist.
insert into auth.users (id, email, encrypted_password) values
  ('eb1f0989-1b9b-4576-9912-037a7fd298a3','seed-a@example.test','x'),
  ('d80083d8-4b17-4052-90fd-f2cb91fbff06','seed-b@example.test','x');
SQL
then
  bad "supabase-compatibility bootstrap failed: $(head -3 "$WORK/bootstrap.log" | tr '\n' ' ')"
  echo
  echo "1 check failed before anything could run." >&2
  exit 1
fi

say "2. Migrations apply to a clean schema"
MIG_FAIL=""
for f in $(ls supabase/migrations/*.sql | sort); do
  if ! $DOCKER exec -i "$PG_CONTAINER" psql -U a2a_app -d a2a -q -v ON_ERROR_STOP=1 < "$f" >"$WORK/mig.log" 2>&1; then
    MIG_FAIL="$(basename "$f")"
    bad "migration $MIG_FAIL failed: $(head -2 "$WORK/mig.log" | tr '\n' ' ')"
    break
  fi
done
[[ -z "$MIG_FAIL" ]] && ok "$(ls supabase/migrations/*.sql | wc -l) migrations applied"
[[ -n "$MIG_FAIL" ]] && exit 1

# ------------------------------------------------------------------ fixtures ---
say "3. Fixtures"
SECRET="$(openssl rand -hex 32)"
KEY_ID="e2e-key"
KEY_HASH="$(printf '%s' "$SECRET" | sha256sum | cut -d' ' -f1)"
$DOCKER exec -i "$PG_CONTAINER" psql -U a2a_app -d a2a -q \
  -v kid="$KEY_ID" -v sec="$SECRET" -v h="$KEY_HASH" >/dev/null 2>&1 <<'SQL'
insert into agents (name, display_name, owner, capabilities, trust_tier, owner_user_id) values
  ('alpha','Alpha','seed-a@example.test',ARRAY['contracts','projects','tasks'],'internal','eb1f0989-1b9b-4576-9912-037a7fd298a3'),
  ('beta','Beta','seed-b@example.test',ARRAY['contracts'],'internal','d80083d8-4b17-4052-90fd-f2cb91fbff06');
insert into service_keys (key_id, key_hash, signing_secret, agent_id, human_owner, label, is_active)
select :'kid', :'h', :'sec', id, 'seed-a@example.test', 'e2e', true from agents where name='alpha';
SQL
ok "two agents and a signing key"

# ----------------------------------------------------------------------- app ---
say "4. App boots against that schema"
mkdir -p "$WORK/attachments"
DATABASE_URL="postgresql://a2a_app:e2e@127.0.0.1:$PG_PORT/a2a" \
  A2A_ATTACHMENT_DIR="$WORK/attachments" NODE_ENV=production \
  setsid npx next start -p "$APP_PORT" >"$WORK/app.log" 2>&1 &
APP_PID=$!
UP=""
for _ in $(seq 1 45); do
  curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$APP_PORT/api/v1/health" && { UP=1; break; }
  sleep 2
done
[[ -n "$UP" ]] && ok "app healthy on $APP_PORT" || { bad "app did not start — $(tail -3 "$WORK/app.log")"; exit 1; }

export A2A_API_KEY="$KEY_ID" A2A_SIGNING_SECRET="$SECRET" A2A_BASE_URL="http://127.0.0.1:$APP_PORT"
a2a() { python3 skill/scripts/a2a "$@" 2>&1; }

# ------------------------------------------------------------------- flows ---
say "5. Project and task creation"
PROJECT_ID="$(a2a project-create "E2E project" | grep -oE '[0-9a-f-]{36}' | head -1)"
[[ -n "$PROJECT_ID" ]] && ok "project created" || bad "project-create produced no id"
TASK_ID="$(a2a task-create "$PROJECT_ID" "E2E task" | grep -oE '[0-9a-f-]{36}' | head -1)"
[[ -n "$TASK_ID" ]] && ok "task created" || bad "task-create produced no id"

say "6. Contract linked to the task at creation"
OUT="$(a2a propose "E2E linked" --to beta --project "$PROJECT_ID" --task "$TASK_ID")"
check "propose --project/--task succeeds" "$OUT" "Contract proposed"
check "response carries the linked project" "$OUT" "Project: E2E project"
LINKED_ID="$(printf '%s' "$OUT" | grep -oE 'ID: [0-9a-f-]{36}' | head -1 | cut -d' ' -f2)"

say "7. A refused link creates no orphan contract"
BEFORE="$(psql_q -c 'select count(*) from contracts;')"
OUT="$(a2a propose "E2E bad link" --to beta --project "$PROJECT_ID" --task '00000000-0000-0000-0000-000000000000')"
check "unknown task is refused" "$OUT" "404"
AFTER="$(psql_q -c 'select count(*) from contracts;')"
[[ "$BEFORE" == "$AFTER" ]] && ok "no contract created ($BEFORE = $AFTER)" || bad "orphan contract left behind ($BEFORE -> $AFTER)"

say "8. project_id and task_id must travel together"
check "half a link is refused" "$(a2a propose "E2E half" --to beta --project "$PROJECT_ID")" "must be used together"

say "9. Unlinked contracts are flagged and cannot take attachments"
OUT="$(a2a propose "E2E unlinked" --to beta)"
check "unlinked proposal warns" "$OUT" "not linked to a project task"
UNLINKED_ID="$(printf '%s' "$OUT" | grep -oE 'ID: [0-9a-f-]{36}' | head -1 | cut -d' ' -f2)"
printf 'a,b\n1,2\n' > "$WORK/sample.csv"
check "attach refused while unlinked" "$(a2a contract-attach "$UNLINKED_ID" --file "$WORK/sample.csv")" "not linked to a project task"

say "10. Multipart upload (the HMAC contract)"
check "attach to a linked contract succeeds" \
  "$(a2a contract-attach "$LINKED_ID" --file "$WORK/sample.csv" --note e2e)" '"filename": "sample.csv"'

say "11. Linking afterwards unblocks attachments"
check "contract-link succeeds" \
  "$(a2a contract-link "$UNLINKED_ID" --project "$PROJECT_ID" --task "$TASK_ID")" "linked to task"
check "attach now succeeds" \
  "$(a2a contract-attach "$UNLINKED_ID" --file "$WORK/sample.csv")" '"filename": "sample.csv"'

say "12. Contract-to-contract links"
# The acyclicity trigger and the both-ends permission rule live in the database
# and in a route, so no unit test can reach them.
check "relate records a successor" \
  "$(a2a contract-relate "$UNLINKED_ID" --to "$LINKED_ID" --type continues --note 'turn budget ran out')" \
  "continues"
check "the link reads from the from end" \
  "$(a2a contract-relations "$UNLINKED_ID")" "Continues: E2E linked"
check "and reads back from the other end" \
  "$(a2a contract-relations "$LINKED_ID")" "Continued by: E2E unlinked"
check "re-recording the same link is not an error" \
  "$(a2a contract-relate "$UNLINKED_ID" --to "$LINKED_ID" --type continues)" "continues"
check "the reverse link is refused as a cycle" \
  "$(a2a contract-relate "$LINKED_ID" --to "$UNLINKED_ID" --type continues)" "cycle"
check "self-linking is refused" \
  "$(a2a contract-relate "$LINKED_ID" --to "$LINKED_ID" --type continues)" "itself"
check "a contract you are not in is refused" \
  "$(a2a contract-relate "$LINKED_ID" --to '00000000-0000-0000-0000-000000000000' --type continues)" "participant in both"
check "unrelate removes it" \
  "$(a2a contract-unrelate "$UNLINKED_ID" --to "$LINKED_ID" --type continues)" "Removed"
check "and it is gone from both ends" \
  "$(a2a contract-relations "$LINKED_ID")" "No related contracts"
# Removing a link that was never there is the asked-for end state, not an error
# — but reporting it as a removal would make a mistyped id read as success.
check "removing a link that was never there says so" \
  "$(a2a contract-unrelate "$UNLINKED_ID" --to "$LINKED_ID" --type continues)" "Nothing to remove"

say "13. Observers read links but do not record them"
# The read path used to call the write check, so an observer was refused the
# read by a message promising them the read. No fixture has an observer, so
# borrow one: demote the key's own participant row, then put it back.
psql_q -c "update contract_participants set role='observer' where contract_id='$LINKED_ID';" >/dev/null
check "an observer can read the link list" \
  "$(a2a contract-relations "$LINKED_ID")" "No related contracts"
check "an observer cannot record a link" \
  "$(a2a contract-relate "$LINKED_ID" --to "$UNLINKED_ID" --type continues)" "Observers may read"
check "an observer cannot remove one either" \
  "$(a2a contract-unrelate "$LINKED_ID" --to "$UNLINKED_ID" --type continues)" "Observers may read"
psql_q -c "update contract_participants set role='proposer' where contract_id='$LINKED_ID';" >/dev/null
check "and recording works again once they are not" \
  "$(a2a contract-relate "$LINKED_ID" --to "$UNLINKED_ID" --type continues)" "continues"

# ----------------------------------------------------------------- summary ---
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]] || exit 1
