#!/bin/sh
# Lighthouse (mobile, simulated 4G / CPU ×4) on the key public pages, N runs each; one JSON per run
# in $OUT. Used for docs/seo/audit.md (before / after). Run in the Playwright image:
#   docker run --rm --network notetonmaster_default -v "$PWD":/app -w /app --user 1000:1000 \
#     -e HOME=/tmp mcr.microsoft.com/playwright:v1.65.0-noble \
#     sh scripts/lighthouse-pages.sh http://nm-prodlocal:3000 docs/seo/data/lh-apres 3 /,/explorer
set -e
BASE=$1
OUT=$2
RUNS=${3:-3}
PAGES=${4:-/}
CHROME_PATH=$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -1)
export CHROME_PATH
mkdir -p "$OUT"
for p in $(echo "$PAGES" | tr ',' ' '); do
  name=$(echo "$p" | sed 's#[/?=&]#_#g')
  for i in $(seq 1 "$RUNS"); do
    npx -y lighthouse@12.8.2 "$BASE$p" --quiet --output=json --output-path="$OUT/$name.$i.json" \
      --only-categories=performance,seo,accessibility,best-practices \
      --chrome-flags="--headless=new --no-sandbox" || true
  done
done
