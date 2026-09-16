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

    # Append the commit body as bullets.
    #
    # Git convention wraps commit bodies at ~72 characters, so a line is NOT a
    # unit of meaning — emitting one bullet per line shreds ordinary prose
    # mid-sentence. Instead, accumulate continuation lines into the bullet or
    # paragraph they belong to, and flush on a blank line or a new "- " bullet.
    if [[ -n "$COMMIT_BODY" ]]; then
      PENDING=""

      flush_pending() {
        if [[ -n "$PENDING" ]]; then
          BLOCK="$BLOCK\\n- $PENDING"
          PENDING=""
        fi
      }

      while IFS= read -r line; do
        # Trim trailing whitespace
        line="${line%"${line##*[![:space:]]}"}"

        # A blank line ends the current bullet or paragraph.
        if [[ -z "$line" ]]; then
          flush_pending
          continue
        fi

        # Skip git trailers (Co-Authored-By, Signed-off-by, Refs, ...). They are
        # commit metadata, not changelog content.
        if [[ "$line" =~ ^[A-Za-z-]+-([Bb]y|[Tt]o):[[:space:]] || "$line" =~ ^(Refs|Closes|Fixes|Co-authored-by|Signed-off-by): ]]; then
          flush_pending
          continue
        fi

        # An explicit bullet starts a new one; anything else continues the
        # current bullet or paragraph.
        if [[ "$line" =~ ^[[:space:]]*[-*][[:space:]]+ ]]; then
          flush_pending
          PENDING="$(printf '%s' "$line" | sed -E 's/^[[:space:]]*[-*][[:space:]]+//')"
        elif [[ -n "$PENDING" ]]; then
          PENDING="$PENDING $(printf '%s' "$line" | sed -E 's/^[[:space:]]+//')"
        else
          PENDING="$line"
        fi
      done <<< "$COMMIT_BODY"

      flush_pending
    fi

    # Insert new version block after the FIRST "---" separator line only
    sed -i "0,/^---$/{/^---$/a\\$BLOCK
    }" CHANGELOG.md
  fi
fi

# This script runs under sudo (see .github/workflows/deploy.yml), so every
# object and ref git writes here lands owned by root — inside a checkout the
# runner owns. The next run's `git pull`, which is NOT sudo, then dies with
# "insufficient permission for adding an object to repository database".
#
# That is why deploys alternated between passing and failing: each success
# poisoned the run after it. Restoring ownership once the writes are done is
# the whole fix. See AC-39.
REPO_OWNER="$(stat -c '%u:%g' "$PWD")"

git add package.json CHANGELOG.md
git diff --cached --quiet || {
  git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
  git push origin main
}

# .git for the objects and refs git just wrote; the two files because the
# version bump rewrites them in place with sed, also as root.
chown -R "$REPO_OWNER" "$PWD/.git" "$PWD/package.json" "$PWD/CHANGELOG.md"

# Build web image before touching the live container. This keeps the current
# production app serving while the replacement image is compiled.
IMAGE="a2a-comms-a2a-comms:v$NEW_VERSION"
NEW_CONTAINER="a2a-comms-v${NEW_VERSION//./-}"
TRAEFIK_CONFIG="/root/traefik/config/a2a-comms.yml"

DOCKER_BUILDKIT=1 docker build \
  --target runner \
  --build-arg NEXT_PUBLIC_APP_URL="$(env_value NEXT_PUBLIC_APP_URL || true)" \
  -t "$IMAGE" . >&2 2>&1

# Start the replacement beside the old app. Do not use docker compose for the
# web container here: compose recreates the fixed container_name and causes 502s.
docker rm -f "$NEW_CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$NEW_CONTAINER" \
  --restart unless-stopped \
  --health-cmd='wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/v1/health || exit 1' \
  --health-interval=30s \
  --health-timeout=10s \
  --health-retries=3 \
  --health-start-period=15s \
  --env-file .env \
  --network trading-v2-network \
  --network-alias a2a-comms-next \
  -v /srv/a2a-comms/attachments:/data/attachments \
  "$IMAGE" >/dev/null
docker network connect clawdius-data "$NEW_CONTAINER"

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
target = f'url: "http://{container}:3000"'
if target in text:
    raise SystemExit(0)
new = re.sub(r'url: "http://a2a-comms(?:-v[0-9-]+(?:-com)?)?:3000"', f'url: "http://{container}:3000"', text)
if new == text:
    raise SystemExit('Traefik a2a-comms service URL not found')
tmp = path.with_suffix(path.suffix + '.tmp')
tmp.write_text(new)
tmp.replace(path)
PY

# Verify through the public/proxy path before removing the old app.
for i in {1..20}; do
  if curl -sf https://a2a.playground.montytorr.com/api/v1/health >/dev/null 2>&1; then
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
docker compose -f docker-compose.yml build webhook-worker invitation-sweep-worker stale-blocker-sweep-worker >&2 2>&1
docker compose -f docker-compose.yml up -d --no-deps webhook-worker invitation-sweep-worker stale-blocker-sweep-worker >&2 2>&1

# Export version for CI (MUST be the only stdout line — workflow captures this via tail -1)
echo "$NEW_VERSION"
