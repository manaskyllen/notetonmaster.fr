#!/bin/sh
# Assembles a runnable copy of the production build, laid out like the runner image (Dockerfile):
#   sh scripts/standalone-site.sh <dir>
#   cd <dir> && PORT=3002 HOSTNAME=0.0.0.0 NODE_ENV=production node server.js
# The Next.js server of `output: 'standalone'` (.next/standalone) with .next/static and public/
# beside it; `next start` does not serve this kind of build. The other files of the project
# (fixtures, prisma, content…) are linked in, as the runner image copies them: the copy is its own,
# so several servers never share the data cache of Next.js (it lives on disk, in .next/cache).
set -eu
DEST=${1:?Usage: sh scripts/standalone-site.sh <dir>}
ROOT=$(pwd)
[ -f .next/standalone/server.js ] || { echo "No standalone build: run pnpm build first." >&2; exit 1; }
rm -rf "$DEST" && mkdir -p "$DEST"
cp -R .next/standalone/. "$DEST/"
# Next.js copies the .env files of the build machine into standalone: the environment of the
# process is the only configuration here (as in the runner image, built without them).
rm -f "$DEST"/.env "$DEST"/.env.*
mkdir -p "$DEST/.next/static"
cp -R .next/static/. "$DEST/.next/static/"
cp -R public "$DEST/public"
# Everything else of the project, through links (not its dot files: no local .env).
for f in "$ROOT"/*; do
  [ -e "$DEST/$(basename "$f")" ] || ln -s "$f" "$DEST/"
done
