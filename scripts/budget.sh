#!/bin/sh
# JavaScript budget of perf-budget.json, as the CI job build-budget measures it, on a machine:
# the demo seed in its own database (notetonmaster_budget, dropped and recreated; the database of
# DATABASE_URL is never touched), the production build served by its standalone server, then
# scripts/perf.mjs --js-only --assert. `make budget` runs it in the dev image.
#   sh scripts/budget.sh            build, then measure
#   SKIP_BUILD=1 sh scripts/budget.sh    measure the build already in .next
set -eu
PORT=${BUDGET_PORT:-3099}
DIR=${BUDGET_DIR:-/tmp/nm-budget}
BIN=node_modules/.bin
url_of() { node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/" + process.argv[1]; console.log(u.toString())' "$1"; }
DB=$(url_of notetonmaster_budget)

DATABASE_URL=$(url_of postgres) node -e '
const pg = require("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
c.connect()
  .then(() => c.query("DROP DATABASE IF EXISTS notetonmaster_budget WITH (FORCE)"))
  .then(() => c.query("CREATE DATABASE notetonmaster_budget"))
  .then(() => c.end(), (e) => { console.error(e.message); process.exit(1); });'
DATABASE_URL=$DB "$BIN/prisma" migrate deploy > /dev/null
DATABASE_URL=$DB CI=1 "$BIN/tsx" prisma/seed.ts > /dev/null
[ -n "${SKIP_BUILD:-}" ] || "$BIN/next" build > /dev/null

sh scripts/standalone-site.sh "$DIR"
(cd "$DIR" && DATABASE_URL=$DB PORT=$PORT HOSTNAME=127.0.0.1 NODE_ENV=production \
  nohup node server.js > "$DIR.log" 2>&1 & echo $! > "$DIR.pid")
trap 'kill "$(cat "$DIR.pid")" 2>/dev/null || true' EXIT
tries=0
until node -e 'fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
  "http://127.0.0.1:$PORT/api/health"; do
  tries=$((tries + 1))
  [ "$tries" -lt 60 ] || { echo "The server did not start:" >&2; tail -n 50 "$DIR.log" >&2; exit 1; }
  sleep 1
done
node scripts/perf.mjs --base="http://127.0.0.1:$PORT" --n=2 --c=1 --js-only --assert
