# shellcheck shell=bash
# Shared by scripts/deploy.sh, backup.sh and restore.sh (sourced by bash). Run on the server,
# from the repository folder, with the production environment file .env.prod.
#   ENV_FILE              another environment file (local tests)
#   COMPOSE_PROJECT_NAME  another project name (local tests: never the dev stack's)

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# Exported: docker-compose.prod.yml reads it too (env_file of the services).
export ENV_FILE=${ENV_FILE:-$ROOT/.env.prod}
PROJECT=${COMPOSE_PROJECT_NAME:-notetonmaster}

die() {
	printf '❌ %s\n' "$*" >&2
	exit 1
}
step() { printf '\n==> %s\n' "$*"; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE manque (cp .env.prod.example .env.prod, docs/deploiement.md)"

# A value of the environment file (last KEY=value, surrounding quotes removed), else $2.
envget() {
	_v=$(sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")
	printf '%s' "${_v:-${2:-}}"
}

dc() { docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f "$ROOT/docker-compose.prod.yml" "$@"; }

PG_USER=$(envget POSTGRES_USER notetonmaster)
PG_DB=$(envget POSTGRES_DB notetonmaster)
BACKUP_DIR=${BACKUP_DIR:-$(envget BACKUP_DIR /var/backups/notetonmaster)}

# psql in the postgres container, as the owner, stopping at the first error.
psql_db() { dc exec -T postgres psql -X -q -v ON_ERROR_STOP=1 -U "$PG_USER" -d "$PG_DB" "$@"; }

# Tables whose data is rebuilt after a restore, never backed up: search index (table and view),
# raw collected pages and staging of the syncs, anti-abuse counters, log of review reads (the
# counts stay on the reviews), Turnstile log, demo history of the activity chart.
# shellcheck disable=SC2034 # used by backup.sh
REBUILT_TABLES='"ProgramSearchIndex" search_document "RawSnapshot" "CrawlPage" "StagingRecord" "RateLimitHit" "ReviewView" "TurnstileLog" "ActivitySnapshot"'

# The JSON of /api/health once the app answers (2 minutes at most), from inside its container.
wait_healthy() {
	local out
	for _ in $(seq 1 60); do
		if out=$(dc exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async (r) => { console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))" 2>/dev/null); then
			printf '%s' "$out"
			return 0
		fi
		sleep 2
	done
	return 1
}

# Number of tables of the application schema (0: an empty database).
table_count() { psql_db -At -c "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"; }
