#!/usr/bin/env bash
# Turn the tag v<version> into a GitHub release, with the changelog as its notes.
#
#   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo ./scripts/publish-release.sh 1.0.334
#
# WHY A SCRIPT AND NOT A WORKFLOW STEP: the same code backfills the releases
# that 328 versions never got, and runs on every deploy from now on. One
# implementation means the backfilled pages and the future ones are the same
# thing, rather than two renderings of the changelog that drift.
#
# Idempotent: a release that already exists is left exactly as it is. This runs
# after a deploy that has already succeeded, so it is re-runnable by hand and
# must never rewrite a page somebody has since edited.
#
# It refuses to create a release for a tag the remote does not have. GitHub's
# releases API will happily CREATE a missing tag, pointing it at the default
# branch head — which is how you get a v1.0.334 release sitting on whatever
# happened to be on main at the time. ci-deploy.sh pushes the tag and only
# warns if that fails, so this case is reachable.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?usage: publish-release.sh <version>   e.g. 1.0.334}"
VERSION="${VERSION#v}"
TAG="v$VERSION"
REPO="${GITHUB_REPOSITORY:-montytorr/a2a-comms}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is required}"

api() {
  curl -sS -o "$2" -w '%{http_code}' \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "${@:3}" "https://api.github.com/repos/$REPO/$1"
}

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

# A few seconds of grace: ci-deploy.sh pushes the tag moments before this runs,
# and "not there yet" and "never pushed" look identical from here.
for attempt in 1 2 3; do
  CODE="$(api "git/ref/tags/$TAG" "$OUT")"
  [[ "$CODE" == "200" ]] && break
  [[ "$attempt" == "3" ]] || sleep 3
done
if [[ "$CODE" != "200" ]]; then
  echo "$TAG is not on the remote (HTTP $CODE) — refusing to let GitHub invent it" >&2
  exit 1
fi

CODE="$(api "releases/tags/$TAG" "$OUT")"
if [[ "$CODE" == "200" ]]; then
  echo "$TAG already has a release; leaving it alone" >&2
  exit 0
fi

NOTES="$(./scripts/release-notes.sh "$VERSION")"

BODY="$(TAG="$TAG" NOTES="$NOTES" python3 -c '
import json, os
print(json.dumps({
    "tag_name": os.environ["TAG"],
    "name": os.environ["TAG"],
    "body": os.environ["NOTES"],
    "draft": False,
    "prerelease": False,
}))')"

CODE="$(api releases "$OUT" -X POST -d "$BODY")"
if [[ "$CODE" != "201" ]]; then
  echo "creating the release for $TAG failed (HTTP $CODE): $(head -c 400 "$OUT")" >&2
  exit 1
fi

python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["html_url"])' "$OUT"
