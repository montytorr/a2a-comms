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
git add package.json
git diff --cached --quiet || {
  git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
  git push origin main
}

# Build and deploy with prod overlay
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache 2>&1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d 2>&1

# Health check
sleep 8
curl -sf http://localhost:3700/api/v1/health > /dev/null 2>&1 && echo "OK: v$NEW_VERSION" || (echo "FAIL" && exit 1)

# Export version for CI
echo "$NEW_VERSION"
