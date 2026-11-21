#!/usr/bin/env bash
# Builds the game for GitHub Pages into docs/ (served at https://<user>.github.io/emergencyxsim/).
# Usage: tools/build-pages.sh [/base/path/]
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="${1:-/emergencyxsim/}"
cp app.json .exact/app.json.bak
trap 'mv .exact/app.json.bak app.json' EXIT
bun -e "
const f = Bun.file('app.json'); const j = await f.json();
j.host = j.host ?? {}; j.host.web = { ...(j.host.web ?? {}), base: '$BASE' };
await Bun.write('app.json', JSON.stringify(j, null, 2) + '\n');"
rm -rf docs dist/pages
bun exact.mjs web-build --out dist/pages
cp -R dist/pages docs
rm -f docs/.exact-build.json   # build metadata (local paths), not served
touch docs/.nojekyll
cp docs/shell.html docs/404.html
echo "docs/ ready for GitHub Pages (base $BASE)"
