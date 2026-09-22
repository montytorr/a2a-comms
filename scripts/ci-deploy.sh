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

# Deploy the commit that triggered this run, or stand down.
#
# The workflow has no actions/checkout and never referenced github.sha: both
# jobs just pulled origin/main into this one shared directory on the self-hosted
# runner. The runner serialises JOBS, not RUNS, so jobs from different runs
# interleave — and an earlier run's deploy routinely started minutes AFTER a
# later commit had landed. Measured: run 4042eb6 deployed at 06:03:47, four
# minutes after a85bd0a was pushed. It shipped both as 1.0.313; the run that
# owned a85bd0a then found only a bump commit and minted 1.0.314 with no
# commits, a byte-identical image, and no changelog entry. That is where
# 1.0.311, .314, .317 and .324 came from, and why Discord announced versions
# the changelog filed elsewhere.
#
# The fix is not to build the older tree — the newer commit is already merged
# and is what should ship. It is for the superseded run to stand down and let
# the run that owns the tip deploy both commits under one honest version.
# This script runs under sudo (see .github/workflows/deploy.yml), so every
# object and ref git writes here lands owned by root — inside a checkout the
# runner owns. The next run's `git pull`, which is NOT sudo, then dies with
# "insufficient permission for adding an object to repository database". That is
# why deploys once alternated between passing and failing: each success poisoned
# the run after it. See AC-39.
#
# It is a trap rather than a line after the commit, because the version bump now
# stays in the working tree until the deploy has actually succeeded — so an
# early exit can leave root-owned files behind where it previously could not.
REPO_OWNER="$(stat -c '%u:%g' "$PWD")"
PUBLISHED="no"

finish() {
  local status=$?
  # A bump that never shipped must not survive into the next run, or the next
  # version is computed from a version that does not exist.
  if [[ "$status" -ne 0 && "$PUBLISHED" == "no" ]]; then
    git checkout -- package.json CHANGELOG.md 2>/dev/null || true
  fi
  chown -R "$REPO_OWNER" "$PWD/.git" "$PWD/package.json" "$PWD/CHANGELOG.md" 2>/dev/null || true
  exit "$status"
}
trap finish EXIT

EXPECTED_SHA="${1:-}"
if [[ -n "$EXPECTED_SHA" ]]; then
  HEAD_SHA="$(git rev-parse HEAD)"
  if [[ "$HEAD_SHA" != "$EXPECTED_SHA" ]]; then
    echo "Superseded: this run is for ${EXPECTED_SHA:0:7}, but main is now at ${HEAD_SHA:0:7}." >&2
    echo "The run that owns ${HEAD_SHA:0:7} will deploy both. Standing down." >&2
    echo "SUPERSEDED"
    exit 0
  fi
fi

# Apply any migration the running database has not seen.
#
# Nothing in this pipeline used to touch the schema, so every schema change
# reached production by hand — and the failure mode is quiet. A release that
# adds a table ships code querying a table that is not there, and
# src/lib/db/client.ts catches the error and returns { data: null, error }
# rather than throwing, so the read degrades to an empty result and the app
# stays healthy while telling everyone there is nothing to see. v1.0.316 did
# exactly that with contract_links for twenty-five minutes.
#
# Before the build on purpose: the new container must come up against the
# schema it was written for. Migrations here are additive, so the OLD container
# keeps serving correctly against the new schema for the minute between this
# and the Traefik switch.
#
# migrate.sh is idempotent and records what it applied in schema_migrations, so
# a redeploy with no new migration is a no-op.
# Through the container, not the URL: production's DATABASE_URL names
# `clawdius-postgres`, a docker-network hostname this host cannot resolve. Every
# other script here reaches it the same way.
echo "Applying migrations…" >&2
HOLLOWAY_DB_CONTAINER="${HOLLOWAY_DB_CONTAINER:-${A2A_DB_CONTAINER:-clawdius-postgres}}" ./scripts/migrate.sh >&2

# Bump patch version
CURRENT=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
sed -i "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW_VERSION\"/" package.json

# Auto-update CHANGELOG.md from every commit this release actually contains.
#
# This used to read `git log -1 HEAD` after the pull above, which is not the
# commit that triggered the run. Two pushes minutes apart therefore raced: the
# first run pulled, saw the SECOND commit as HEAD, and filed it under the first
# run's version; the second run then pulled, saw only a bump commit, skipped,
# and produced a version with no entry at all. That is how 1.0.305 described
# the wrong commit and 1.0.306 described nothing. A run that dies before this
# point (a failed build, say) lost its commit's entry the same way.
#
# So: describe every non-bump commit since the last bump instead of guessing a
# single one. A dropped or batched commit is picked up by the next deploy
# rather than being lost, and each release documents what it really contains.
python3 - "$NEW_VERSION" <<'PY'
import re, subprocess, sys
from datetime import datetime, timezone

version = sys.argv[1]
path = "CHANGELOG.md"

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout

changelog = open(path, encoding="utf-8").read()
if f"## [{version}]" in changelog:
    sys.exit(0)

# Everything since the last version bump is undescribed by definition.
history = [l.split(" ", 1) for l in git("log", "--format=%H %s", "-n", "200").splitlines()]
base = next((h for h, s in history if s.startswith("chore: bump")), None)
rng = [f"{base}..HEAD"] if base else ["-n", "1", "HEAD"]
shas = git("log", "--format=%H", "--reverse", *rng).split()
if not shas:
    sys.exit(0)

SECTION = [(r"^(fix)(\(|:)", "Fixed"), (r"^(feat)(\(|:)", "Added"),
           (r"^(docs)(\(|:)", "Docs"), (r"^(security|sec)(\(|:)", "Security")]
ORDER = ["Added", "Changed", "Fixed", "Docs", "Security"]
PREFIX = re.compile(r"^(fix|feat|docs|refactor|chore|security|sec|ci)(\([^)]*\))?:\s*")
TRAILER = re.compile(r"^[A-Za-z-]+-([Bb]y|[Tt]o):\s|^(Refs|Closes|Fixes|Co-authored-by|Signed-off-by)\b")
BULLET = re.compile(r"^\s*[-*]\s+")

def bullets(body):
    # Git wraps bodies at ~72 chars, so a line is not a unit of meaning:
    # accumulate continuation lines and flush on a blank line or a new bullet.
    out, pending = [], ""
    def flush():
        nonlocal pending
        if pending:
            out.append("- " + pending)
            pending = ""
    for line in body.split("\n"):
        line = line.rstrip()
        if not line or TRAILER.search(line):
            flush()
        elif BULLET.match(line):
            flush()
            pending = BULLET.sub("", line)
        elif pending:
            pending += " " + line.lstrip()
        else:
            pending = line
    flush()
    return out

groups = {}
for sha in shas:
    subject = git("log", "-1", "--format=%s", sha).strip()
    if subject.startswith("chore: bump"):
        continue
    section = next((n for p, n in SECTION if re.match(p, subject)), "Changed")
    entry = ["- " + PREFIX.sub("", subject)] + bullets(git("log", "-1", "--format=%b", sha))
    groups.setdefault(section, []).extend(entry)

if not groups:
    sys.exit(0)

block = [f"## [{version}] - " + datetime.now(timezone.utc).strftime("%Y-%m-%d")]
for section in ORDER:
    if section in groups:
        block += [f"### {section}"] + groups[section]

# Insert after the first "---" separator, which sits under the file header.
marker = "\n---\n"
head, sep, tail = changelog.partition(marker)
if not sep:
    # Warn, do not abort: the caller runs under `set -e`, and a malformed
    # changelog is not a reason to fail a production deploy.
    print("CHANGELOG.md: missing '---' insertion marker, skipping", file=sys.stderr)
    sys.exit(0)
open(path, "w", encoding="utf-8").write(head + sep + "\n" + "\n".join(block) + "\n" + tail)
PY

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
#
# The URL comes from .env rather than being hardcoded. It used to name one
# specific deployment, which meant a fork of this repo health-checked THAT
# instance after switching its own Traefik — and passed whether or not its own
# deploy had worked. A gate that can only succeed is not a gate.
PUBLIC_URL="$(env_value NEXT_PUBLIC_APP_URL || true)"
if [[ -z "$PUBLIC_URL" ]]; then
  echo "FAIL: NEXT_PUBLIC_APP_URL is not set in .env; cannot verify the public path" >&2
  exit 1
fi
PUBLIC_URL="${PUBLIC_URL%/}"

for i in {1..20}; do
  if curl -sf "$PUBLIC_URL/api/v1/health" >/dev/null 2>&1; then
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
docker compose -f docker-compose.yml build webhook-worker invitation-sweep-worker stale-blocker-sweep-worker stale-run-sweep-worker >&2 2>&1
docker compose -f docker-compose.yml up -d --no-deps webhook-worker invitation-sweep-worker stale-blocker-sweep-worker stale-run-sweep-worker >&2 2>&1

# Publish the version ONLY now that it is serving traffic.
#
# This used to run before `docker build`. Under `set -e`, any failure after it —
# a broken build, an unhealthy container, a Traefik switch that did not take —
# left package.json and CHANGELOG.md committed and PUSHED to main claiming a
# version had shipped while production still served the previous one. The next
# run then bumped from the phantom, so that version was never built at all: it
# existed in the changelog and in git history and nowhere else.
git add package.json CHANGELOG.md
git diff --cached --quiet || {
  git commit -m "chore: bump version to $NEW_VERSION [skip ci]"
  git push origin main
}
PUBLISHED="yes"

# A tag, so a version is something you can check out.
#
# There were 328 published versions and zero tags, because nothing ever created
# one. Tagging was not worth adding while a version could contain two commits or
# none — it would have tagged a counter. Now that one version means one tree, it
# means something. Annotated so the tag carries its own date and author.
if git rev-parse -q --verify "refs/tags/v$NEW_VERSION" >/dev/null; then
  echo "tag v$NEW_VERSION already exists; leaving it alone" >&2
else
  git tag -a "v$NEW_VERSION" -m "v$NEW_VERSION" && git push origin "v$NEW_VERSION" >&2 2>&1 || {
    # A tag that fails to push must not fail a deploy that already succeeded.
    echo "WARN: could not push tag v$NEW_VERSION" >&2
  }
fi

# Export version for CI (MUST be the only stdout line — workflow captures this via tail -1)
echo "$NEW_VERSION"
