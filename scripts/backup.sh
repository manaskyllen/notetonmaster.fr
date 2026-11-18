#!/usr/bin/env bash
# Backup of notetonmaster, encrypted with age (docs/deploiement.md, « Sauvegardes »):
#
#   scripts/backup.sh               nightly (cron on the host): database and uploads, the last
#                                   BACKUP_KEEP (7) kept in BACKUP_DIR/daily/
#   scripts/backup.sh --pre-deploy  quick, before the migrations (scripts/deploy.sh): database
#                                   only, the last 3 kept in BACKUP_DIR/pre-deploy/
#
# The database: pg_dump -Fc without the data of the tables rebuilt after a restore (REBUILT_TABLES,
# scripts/prod-env.sh). Encrypted for the public key BACKUP_AGE_RECIPIENT: the private key never
# comes to the server. counts.txt (figures only) is compared after a restore.
set -euo pipefail
# shellcheck source=scripts/prod-env.sh
. "$(dirname "$0")/prod-env.sh"

main() {
	local mode=daily keep
	keep=$(envget BACKUP_KEEP 7)
	if [ "${1:-}" = --pre-deploy ]; then
		mode=pre-deploy
		keep=3
	fi
	local recipient
	recipient=$(envget BACKUP_AGE_RECIPIENT)
	case "$recipient" in
	age1a-remplacer* | '') die "BACKUP_AGE_RECIPIENT : la clé publique age des sauvegardes manque" ;;
	age1*) ;;
	*) die "BACKUP_AGE_RECIPIENT : une clé publique age (age1…) est attendue" ;;
	esac
	command -v age >/dev/null || die "age manque sur l'hôte (apt install age)"

	umask 077
	local stamp dir tmp
	stamp=$(date -u +%Y-%m-%dT%H%M%SZ)
	dir=$BACKUP_DIR/$mode/$stamp
	tmp=$dir.partial
	mkdir -p "$BACKUP_DIR/$mode"
	rm -rf "$BACKUP_DIR/$mode"/*.partial
	mkdir "$tmp"
	trap 'rm -rf "$tmp"' ERR

	step "Base $PG_DB → $dir"
	local -a exclude=()
	local t
	for t in $REBUILT_TABLES; do exclude+=("--exclude-table-data=$t"); done
	dc exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc "${exclude[@]}" |
		age -r "$recipient" >"$tmp/db.dump.age"
	psql_db -At <"$ROOT/scripts/sql/counts.sql" >"$tmp/counts.txt"

	if [ "$mode" = daily ]; then
		step "Justificatifs (volume ${PROJECT}_uploads)"
		docker run --rm --network none -v "${PROJECT}_uploads:/data/uploads:ro" \
			--entrypoint tar postgres:17-alpine -C /data/uploads -czf - . |
			age -r "$recipient" >"$tmp/uploads.tar.gz.age"
	fi

	mv "$tmp" "$dir"
	trap - ERR
	# The most recent `keep` backups stay, the older ones go.
	find "$BACKUP_DIR/$mode" -mindepth 1 -maxdepth 1 -type d ! -name '*.partial' | sort -r |
		tail -n +"$((keep + 1))" | xargs -r rm -rf

	du -sh "$dir"/* | sed 's/^/  /'
	sed 's/^/  /' "$dir/counts.txt"
	echo "✅ sauvegarde $mode : $dir ($keep gardées)"
}

main "$@"
