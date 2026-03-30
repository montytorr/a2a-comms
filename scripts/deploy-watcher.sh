#!/bin/bash
# Watches for new commits on origin/main and auto-deploys
# Polls every 60 seconds

PROJECT_DIR="/root/projects/a2a-comms"
cd "$PROJECT_DIR"

echo "$(date -u +%H:%M:%S) Deploy watcher started (polling every 60s)"

CHECKS=0
while true; do
    # Fetch latest without merging
    git fetch origin main --quiet 2>/dev/null

    LOCAL=$(git rev-parse HEAD 2>/dev/null)
    REMOTE=$(git rev-parse origin/main 2>/dev/null)

    CHECKS=$((CHECKS + 1))

    if [ "$LOCAL" != "$REMOTE" ]; then
        echo "$(date -u +%H:%M:%S) New commits detected (${LOCAL:0:7} → ${REMOTE:0:7}). Deploying..."
        export DISCORD_WEBHOOK_URL="${DISCORD_WEBHOOK_URL:-}"
        /root/projects/a2a-comms/scripts/deploy.sh
    elif [ $((CHECKS % 10)) -eq 0 ]; then
        # Log heartbeat every 10 checks (~10 min)
        echo "$(date -u +%H:%M:%S) Watching... (HEAD=${LOCAL:0:7}, check #$CHECKS)"
    fi

    sleep 60
done
