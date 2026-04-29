#!/bin/bash
set -e
cd /root/projects/a2a-comms

# Read .env values without sourcing the file. Some values are intentionally not
# shell syntax (for example email display names), and sourcing made deploys fail
# before the new image was built.
env_value() {
  python3 - "$1" <<'PY'
import sys
key = sys.argv[1]
with open('.env', 'r', encoding='utf-8') as f:
    for raw in f:
        line = raw.rstrip('\n')
        if not line or line.lstrip().startswith('#') or '=' not in line:
            continue
        k, v = line.split('=', 1)
        if k.strip() == key:
            print(v)
            break
PY
}

# Pull latest
git pull origin main 2>&1

# Bump patch version
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" package.json

# Auto-update CHANGELOG.md from the last commit message (subject + body)
COMMIT_MSG=$(git log -1 --format='%s' HEAD)
COMMIT_BODY=$(git log -1 --format='%b' HEAD)
# Skip version bump commits
if [[ "$COMMIT_MSG" != chore:\ bump* ]]; then
  TODAY=$(date -u +%Y-%m-%d)

  # Determine section from conventional commit prefix
  SECTION="Changed"
  case "$COMMIT_MSG" in
    fix:*|fix\(*) SECTION="Fixed" ;;
    feat:*|feat\(*) SECTION="Added" ;;
    docs:*) SECTION="Docs" ;;
    refactor:*) SECTION="Changed" ;;
    security:*|sec:*) SECTION="Security" ;;
  esac

  # Strip conventional commit prefix for cleaner entry
  ENTRY=$(echo "$COMMIT_MSG" | sed -E 's/^(fix|feat|docs|refactor|chore|security|sec)(\([^)]*\))?:\s*//')

  # Only add if this version isn't already in the changelog
  if ! grep -q "## \[$NEW_VERSION\]" CHANGELOG.md; then
    # Build the changelog block
    BLOCK="\\n## [$NEW_VERSION] - $TODAY\\n### $SECTION\\n- $ENTRY"

    # Append body lines as additional bullet points if commit body exists
    if [[ -n "$COMMIT_BODY" ]]; then
      while IFS= read -r line; do
        [[ -z "$line" ]] && continue
        # Lines starting with - are already bullets; otherwise prefix with -
        if [[ "$line" == -* ]]; then
          BLOCK="$BLOCK\\n$line"
        else
          BLOCK="$BLOCK\\n- $line"
        fi
      done <<< "$COMMIT_BODY"
    fi

    # Insert new version block after the FIRST "---" separator line only
    sed -i "0,/^---$/{/^---$/a\\$BLOCK
    }" CHANGELOG.md
  fi
fi

git add package.json CHANGELOG.md
git diff --cached --quiet || {
  git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
  git push origin main
}

# Build web image before touching the live container. This keeps the current
# production app serving while the replacement image is compiled.
IMAGE="a2a-comms-a2a-comms:v$NEW_VERSION"
NEW_CONTAINER="a2a-comms-v${NEW_VERSION//./-}"
TRAEFIK_CONFIG="/root/traefik/config/a2a-comms.yml"

DOCKER_BUILDKIT=1 docker build \
  --target runner \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$(env_value NEXT_PUBLIC_SUPABASE_URL)" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="$(env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)" \
  --build-arg SUPABASE_SERVICE_ROLE_KEY="$(env_value SUPABASE_SERVICE_ROLE_KEY)" \
  --build-arg NEXT_PUBLIC_APP_URL="$(env_value NEXT_PUBLIC_APP_URL || true)" \
  --build-arg RESEND_API_KEY="$(env_value RESEND_API_KEY)" \
  --build-arg RESEND_FROM="$(env_value RESEND_FROM)" \
  -t "$IMAGE" . >&2 2>&1

# Start the replacement beside the old app. Do not use docker compose for the
# web container here: compose recreates the fixed container_name and causes 502s.
docker rm -f "$NEW_CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$NEW_CONTAINER" \
  --restart unless-stopped \
  --env-file .env \
  --network trading-v2-network \
  --network-alias a2a-comms-next \
  "$IMAGE" >/dev/null

# Wait for the replacement container itself to be healthy before switching Traefik.
for i in {1..40}; do
  if docker exec "$NEW_CONTAINER" wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1; then
    break
  fi
  if [[ "$i" == "40" ]]; then
    docker logs --tail=120 "$NEW_CONTAINER" >&2 || true
    docker rm -f "$NEW_CONTAINER" >/dev/null 2>&1 || true
    echo "FAIL: replacement container did not become healthy" >&2
    exit 1
  fi
  sleep 2
done

# Atomically point Traefik at the healthy replacement. Traefik's file provider
# reloads this dynamic config without restarting the proxy.
python3 - "$TRAEFIK_CONFIG" "$NEW_CONTAINER" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
container = sys.argv[2]
text = path.read_text()
new = re.sub(r'url: "http://a2a-comms(?:-v[0-9-]+)?:3000"', f'url: "http://{container}:3000"', text)
if new == text:
    raise SystemExit('Traefik a2a-comms service URL not found')
tmp = path.with_suffix(path.suffix + '.tmp')
tmp.write_text(new)
tmp.replace(path)
PY

# Verify through the public/proxy path before removing the old app.
for i in {1..20}; do
  if curl -sf https://a2a.playground.montytorr.tech/api/v1/health >/dev/null 2>&1; then
    echo "OK: v$NEW_VERSION" >&2
    break
  fi
  if [[ "$i" == "20" ]]; then
    echo "FAIL: public health check did not recover after Traefik switch" >&2
    exit 1
  fi
  sleep 2
done

# Remove prior web app containers only after the new one is live. Leave workers
# and webhook receiver running; update worker images separately without dropping
# the public web route.
for old in $(docker ps -a --format '{{.Names}}' | grep -E '^a2a-comms($|-v[0-9-]+)' | grep -v "^${NEW_CONTAINER}$" || true); do
  docker rm -f "$old" >/dev/null 2>&1 || true
done

# Rebuild/recreate background workers. This can restart worker processes, but it
# no longer removes the public web container or webhook receiver.
docker compose -f docker-compose.yml -f docker-compose.prod.yml build webhook-worker invitation-sweep-worker stale-blocker-sweep-worker >&2 2>&1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps webhook-worker invitation-sweep-worker stale-blocker-sweep-worker a2a-webhook-receiver >&2 2>&1

# Export version for CI (MUST be the only stdout line — workflow captures this via tail -1)
echo "$NEW_VERSION"
