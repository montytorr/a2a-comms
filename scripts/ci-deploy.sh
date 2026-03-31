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

# Auto-update CHANGELOG.md from the last commit message
COMMIT_MSG=$(git log -1 --format='%s' HEAD)
# Skip version bump commits
if [[ "$COMMIT_MSG" != chore:\ bump* ]]; then
  TODAY=$(date -u +%Y-%m-%d)

  # Determine section from conventional commit prefix
  SECTION="Changed"
  case "$COMMIT_MSG" in
    fix:*|fix\(*) SECTION="Fixed" ;;
    feat:*|feat\(*) SECTION="Added" ;;
    docs:*) SECTION="Changed" ;;
    refactor:*) SECTION="Changed" ;;
    security:*|sec:*) SECTION="Security" ;;
  esac

  # Strip conventional commit prefix for cleaner entry
  ENTRY=$(echo "$COMMIT_MSG" | sed -E 's/^(fix|feat|docs|refactor|chore|security|sec)(\([^)]*\))?:\s*//')

  # Only add if this version isn't already in the changelog
  if ! grep -q "## \[$NEW_VERSION\]" CHANGELOG.md; then
    # Insert new version block after the Format line (with a blank line)
    sed -i "/^Format:.*$/a\\
\\
## [$NEW_VERSION] - $TODAY\\
### $SECTION\\
- $ENTRY" CHANGELOG.md
  fi
fi

git add package.json CHANGELOG.md
git diff --cached --quiet || {
  git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
  git push origin main
}

# Stop and remove existing container to avoid name conflicts
docker compose -f docker-compose.yml -f docker-compose.prod.yml down --remove-orphans 2>&1 || true

# Build and deploy with prod overlay
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache 2>&1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d 2>&1

# Health check
sleep 8
curl -sf http://localhost:3700/api/v1/health > /dev/null 2>&1 && echo "OK: v$NEW_VERSION" || (echo "FAIL" && exit 1)

# Export version for CI
echo "$NEW_VERSION"
