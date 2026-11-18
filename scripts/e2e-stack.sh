#!/bin/sh
# Parallel stack of the end-to-end tests: one production build, served E2E_SERVERS times by its
# standalone server (`node server.js`, as in production: scripts/standalone-site.sh).
#   sh scripts/e2e-stack.sh start    databases + servers + worker processes (after `pnpm build`)
#   sh scripts/e2e-stack.sh stop
#   sh scripts/e2e-stack.sh run [playwright arguments]    start, playwright test, stop
# Server i: http://localhost:$((E2E_BASE_PORT + i)), database notetonmaster_test_<i>, its own copy
# of the build (the data cache of Next.js lives on disk: shared, it would mix the databases), its
# own worker process and its own mail sender. Playwright worker i talks to server i only
# (tests/e2e/stack.ts). Needs DATABASE_URL (server and credentials), the variables of the CI and
# node_modules; no pnpm, so it also runs in the Playwright image (make e2e-full).
set -eu
N=${E2E_SERVERS:=4}
PORT0=${E2E_BASE_PORT:=3100}
DIR=${E2E_DIR:-/tmp/nm-e2e}
ROOT=$(pwd)
BIN="$ROOT/node_modules/.bin"
export E2E_SERVERS E2E_BASE_PORT

db_url() { node -e 'const u = new URL(process.env.DATABASE_URL); u.pathname = "/notetonmaster_test_" + process.argv[1]; console.log(u.toString())' "$1"; }

start() {
  [ -f .next/standalone/server.js ] && [ -f dist/worker.js ] || { echo "No production build: run pnpm build first." >&2; exit 1; }
  "$BIN/tsx" scripts/e2e-db.ts "$N"
  rm -rf "$DIR" && mkdir -p "$DIR"
  i=0
  while [ "$i" -lt "$N" ]; do
    port=$((PORT0 + i))
    site="$DIR/site-$i"
    sh scripts/standalone-site.sh "$site"
    url=$(db_url "$i")
    (cd "$site" && DATABASE_URL="$url" APP_URL="http://localhost:$port" PORT="$port" HOSTNAME=0.0.0.0 \
      MAIL_FROM="notetonmaster <ne-pas-repondre+w$i@notetonmaster.example>" NODE_ENV=production \
      nohup node server.js > "$DIR/next-$i.log" 2>&1 & echo $! >> "$DIR/pids")
    DATABASE_URL="$url" INTERNAL_APP_URL="http://localhost:$port" APP_URL="http://localhost:$port" \
      MAIL_FROM="notetonmaster <ne-pas-repondre+w$i@notetonmaster.example>" NODE_ENV=production \
      NM_PROCESS=worker nohup node dist/worker.js > "$DIR/worker-$i.log" 2>&1 &
    echo $! >> "$DIR/pids"
    i=$((i + 1))
  done
  i=0
  while [ "$i" -lt "$N" ]; do
    port=$((PORT0 + i))
    tries=0
    until node -e 'fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' \
      "http://localhost:$port/api/health"; do
      tries=$((tries + 1))
      [ "$tries" -lt 90 ] || { echo "Server $i did not start:" >&2; tail -n 50 "$DIR/next-$i.log" >&2; exit 1; }
      sleep 1
    done
    i=$((i + 1))
  done
  echo "[e2e-stack] $N server(s) on http://localhost:$PORT0…$((PORT0 + N - 1))"
}

stop() {
  [ -f "$DIR/pids" ] && xargs kill < "$DIR/pids" 2>/dev/null || true
  rm -f "$DIR/pids"
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  run)
    shift
    start
    status=0
    "$BIN/playwright" test "$@" || status=$?
    stop
    exit "$status"
    ;;
  *) echo "Usage: sh scripts/e2e-stack.sh start|stop|run [playwright arguments]" >&2; exit 2 ;;
esac
