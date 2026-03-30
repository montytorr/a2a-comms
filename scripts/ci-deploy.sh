#!/bin/bash
set -e
cd /root/projects/a2a-comms
git pull origin main 2>&1
docker compose build --no-cache 2>&1
docker compose up -d 2>&1
sleep 8
curl -sf http://localhost:3700/api/v1/health > /dev/null 2>&1 && echo "OK" || (echo "FAIL" && exit 1)
