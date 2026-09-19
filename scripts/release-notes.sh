#!/usr/bin/env bash
# Print the CHANGELOG section for one version, as release notes.
#
# WHY THIS EXISTS: a tag is a pointer, a release is the page a newcomer lands
# on, and for 334 versions this repo had neither. AC-76 gave us tags; nothing
# turned them into releases, so a public repository with a 4,000-line changelog
# had an empty /releases.
#
# The notes are the changelog section and nothing else. ci-deploy.sh already
# writes that section from the commits the release really contains, so there is
# one source of truth — a release cannot say something the changelog does not.
#
#   ./scripts/release-notes.sh 1.0.334
#
# Exits 1 when the version has no section, which is the honest answer: a
# release with invented notes is worse than no release.
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?usage: release-notes.sh <version>   e.g. 1.0.334}"
VERSION="${VERSION#v}"

BODY="$(awk -v v="## [$VERSION]" '
  index($0, v) == 1 { inside = 1; next }
  inside && /^## \[/ { exit }
  inside && /^---$/ { next }
  inside { print }
' CHANGELOG.md | sed -e '/./,$!d')"

# Trailing blank lines: harmless in a file, ugly on a release page.
BODY="$(printf '%s\n' "$BODY" | sed -e :a -e '/^\n*$/{$d;N;};/\n$/ba')"

if [[ -z "$BODY" ]]; then
  echo "no CHANGELOG section for $VERSION" >&2
  exit 1
fi

printf '%s\n' "$BODY"
