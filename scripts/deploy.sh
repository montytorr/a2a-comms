#!/bin/bash
# A2A Comms — Local deploy script
# Called manually or by a webhook listener

set -e

WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
PROJECT_DIR="/root/projects/a2a-comms"
cd "$PROJECT_DIR"

echo "$(date -u +%H:%M:%S) Pulling latest..."
git pull origin main

echo "$(date -u +%H:%M:%S) Building..."
docker compose build --no-cache

echo "$(date -u +%H:%M:%S) Deploying..."
docker compose up -d

sleep 5

echo "$(date -u +%H:%M:%S) Health check..."
if curl -sf http://localhost:3700/api/v1/health > /dev/null; then
    echo "$(date -u +%H:%M:%S) ✅ Deploy successful"
    STATUS="✅ **A2A Comms Deploy:** success ($(git log -1 --format='%h %s'))"
else
    echo "$(date -u +%H:%M:%S) ❌ Deploy failed — health check failed"
    STATUS="❌ **A2A Comms Deploy:** failed — health check error"
fi

# Notify Discord
if [ -n "$WEBHOOK_URL" ]; then
    curl -sf -X POST "$WEBHOOK_URL" \
        -H "Content-Type: application/json" \
        -H "User-Agent: A2AComms/1.0" \
        -d "{\"content\": \"$STATUS\"}" || true
fi
