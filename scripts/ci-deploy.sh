#!/bin/bash
set -e
cd /root/projects/a2a-comms

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

# Stop and remove existing containers to avoid name conflicts
docker compose -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans 2>&1 || true
# Fallback: force-remove if compose down missed it (project name mismatch edge case)
docker rm -f a2a-comms 2>/dev/null || true
docker rm -f a2a-webhook-worker 2>/dev/null || true
docker rm -f a2a-invitation-sweep-worker 2>/dev/null || true
docker rm -f a2a-stale-blocker-sweep-worker 2>/dev/null || true
docker rm -f a2a-webhook-receiver 2>/dev/null || true

# Build and deploy with prod overlay (output to stderr so it doesn't pollute version capture)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache >&2 2>&1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d >&2 2>&1

# Health check
sleep 8
curl -sf http://localhost:3700/api/v1/health > /dev/null 2>&1 && echo "OK: v$NEW_VERSION" >&2 || (echo "FAIL" >&2 && exit 1)

# Export version for CI (MUST be the only stdout line — workflow captures this via tail -1)
echo "$NEW_VERSION"
