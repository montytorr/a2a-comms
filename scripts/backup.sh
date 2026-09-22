#!/usr/bin/env bash
# Back up the native PostgreSQL database and filesystem attachment store.
set -euo pipefail

DEST=${HOLLOWAY_BACKUP_DIR:-${A2A_BACKUP_DIR:-/srv/backups/a2a}}
DB_CONTAINER=${HOLLOWAY_DB_CONTAINER:-${A2A_DB_CONTAINER:-clawdius-postgres}}
DB_NAME=${HOLLOWAY_DB_NAME:-${A2A_DB_NAME:-a2a}}
ATTACHMENTS=${HOLLOWAY_ATTACHMENT_DIR:-${A2A_ATTACHMENT_DIR:-/srv/a2a-comms/attachments}}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DOW=$(date -u +%u)

mkdir -p "$DEST/daily" "$DEST/weekly"
DUMP="$DEST/daily/a2a-db-$STAMP.dump"
TEMP_DUMP="$DUMP.tmp"
FILES="$DEST/daily/a2a-storage-$STAMP.tar.gz"
trap 'rm -f "$TEMP_DUMP"' EXIT

docker exec "$DB_CONTAINER" pg_dump -U postgres -d "$DB_NAME" -Fc \
  --schema=public --no-owner --no-privileges > "$TEMP_DUMP"
mv "$TEMP_DUMP" "$DUMP"
[ "$(stat -c%s "$DUMP")" -gt 1024 ]

mkdir -p "$ATTACHMENTS"
tar -czf "$FILES" -C "$ATTACHMENTS" .
(cd "$DEST/daily" && sha256sum "$(basename "$DUMP")" "$(basename "$FILES")" >> SHA256SUMS)

if [ "$DOW" = "7" ]; then
  cp -p "$DUMP" "$FILES" "$DEST/weekly/"
fi

find "$DEST/daily" -name 'a2a-db-*.dump' -mtime +7 -delete
find "$DEST/daily" -name 'a2a-storage-*.tar.gz' -mtime +7 -delete
find "$DEST/weekly" -name 'a2a-*' -mtime +28 -delete
printf '%s Holloway backup complete: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$STAMP"
