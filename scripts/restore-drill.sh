#!/usr/bin/env bash
# Restore the newest native backup into a throwaway database and validate it.
set -euo pipefail

DEST=${HOLLOWAY_BACKUP_DIR:-${A2A_BACKUP_DIR:-/srv/backups/a2a}}
DB_CONTAINER=${HOLLOWAY_DB_CONTAINER:-${A2A_DB_CONTAINER:-clawdius-postgres}}
SCRATCH="a2a_restore_drill_$(date -u +%s)"
LATEST=$(find "$DEST/daily" -maxdepth 1 -name 'a2a-db-*.dump' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
[ -n "$LATEST" ] || { echo "no A2A dump to restore"; exit 1; }

q() { docker exec "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -qtAX -c "$2"; }
q postgres "create database $SCRATCH owner a2a_app" >/dev/null
trap 'q postgres "drop database if exists $SCRATCH with (force)" >/dev/null' EXIT
q "$SCRATCH" 'drop schema public' >/dev/null
docker exec -i "$DB_CONTAINER" pg_restore -U a2a_app -d "$SCRATCH" \
  --exit-on-error --no-owner --no-privileges < "$LATEST"

check() {
  local label=$1 sql=$2 value
  value=$(q "$SCRATCH" "$sql")
  printf '  %s: %s\n' "$label" "$value"
  [ "$value" != "0" ] && [ "$value" != "f" ]
}
check projects 'select count(*) from public.projects'
check agents 'select count(*) from public.agents'
check service_keys 'select count(*) from public.service_keys'
check task_attachments 'select count(*) from public.task_attachments'
check app_users 'select count(*) from public.app_users'
check native_sessions_table "select to_regclass('public.app_sessions') is not null"

LATEST_FILES=$(find "$DEST/daily" -maxdepth 1 -name 'a2a-storage-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)
[ -n "$LATEST_FILES" ]
tar -tzf "$LATEST_FILES" >/dev/null
printf '  attachment archive: readable\nA2A RESTORE DRILL PASSED\n'
