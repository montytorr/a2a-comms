#!/bin/sh
# Install the repo's git hooks into .git/hooks/.
#
# Run from anywhere in the working tree:  npm run hooks:install
set -eu

repo_root=$(git rev-parse --show-toplevel)
hooks_dir=$(git rev-parse --git-path hooks)

for hook in "$repo_root"/ops/hooks/*; do
    name=$(basename "$hook")
    case "$name" in
        install.sh|README.md) continue ;;
    esac
    cp "$hook" "$hooks_dir/$name"
    chmod +x "$hooks_dir/$name"
    echo "installed: $hooks_dir/$name"
done

echo "Doc-sync checks warn by default. Set HOLLOWAY_STRICT_DOCS=1 to make them block."
