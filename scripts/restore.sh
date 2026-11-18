#!/usr/bin/env bash
# Restores a backup of scripts/backup.sh into an EMPTY database (docs/deploiement.md, « Restaurer
# après une panne »). The age private key comes on the standard input, never as a file of the
# server: it lives in memory (/dev/shm) for the time of the restore.
#
#   ssh serveur 'cd /opt/notetonmaster && scripts/restore.sh /var/backups/notetonmaster/daily/<date>' \
#     < ~/chemin/vers/notetonmaster-backup.key
#
# 1. decrypt  2. pg_restore  3. migrations and rights of the roles  4. uploads  5. rebuild of what
# was not backed up (search index, ratings and counters of the cities; the sitemaps follow)
# 6. check: prints the figures and fails when the database is not consistent.
set -euo pipefail
# shellcheck source=scripts/prod-env.sh
. "$(dirname "$0")/prod-env.sh"

main() {
	local src=${1:-}
	if [ -z "$src" ] || [ ! -f "$src/db.dump.age" ]; then
		die "usage : scripts/restore.sh <dossier de sauvegarde> < clé-privée-age"
	fi
	src=$(cd "$src" && pwd)
	[ ! -t 0 ] || die "la clé privée age est attendue sur l'entrée standard (… < clé)"
	command -v age >/dev/null || die "age manque sur l'hôte (apt install age)"

	local keydir=/dev/shm
	if [ ! -d "$keydir" ] || [ ! -w "$keydir" ]; then keydir=${TMPDIR:-/tmp}; fi
	# Global, not local: the EXIT trap runs after main has returned.
	RESTORE_KEY=$(mktemp "$keydir/nm-restore.XXXXXX")
	local key=$RESTORE_KEY
	chmod 600 "$key"
	trap 'rm -f "$RESTORE_KEY"' EXIT
	cat >"$key"
	grep -q '^AGE-SECRET-KEY-' "$key" || die "l'entrée standard n'est pas une clé privée age"

	step "0. Base vide ?"
	dc up -d --wait postgres
	dc stop app worker >/dev/null 2>&1 || true
	local tables
	tables=$(table_count)
	[ "$tables" = 0 ] || die "la base $PG_DB n'est pas vide ($tables tables) : rien n'est restauré (docs/deploiement.md)"

	step "1-2. Déchiffrement et pg_restore de $src/db.dump.age"
	age -d -i "$key" "$src/db.dump.age" |
		dc exec -T postgres pg_restore -U "$PG_USER" -d "$PG_DB" --no-owner --no-privileges --exit-on-error

	step "3. Migrations postérieures à la sauvegarde et droits du rôle nm_app"
	dc run --rm --no-deps migrate sh -c 'pnpm -s prisma migrate deploy && pnpm -s db:roles'

	if [ -f "$src/uploads.tar.gz.age" ]; then
		step "4. Justificatifs (volume ${PROJECT}_uploads)"
		# Created as Compose would, so that `up` adopts it without a warning.
		docker volume create --label "com.docker.compose.project=$PROJECT" \
			--label com.docker.compose.volume=uploads "${PROJECT}_uploads" >/dev/null
		age -d -i "$key" "$src/uploads.tar.gz.age" |
			docker run --rm -i --network none -v "${PROJECT}_uploads:/data/uploads" \
				--entrypoint sh postgres:17-alpine -c 'tar -C /data/uploads -xzf - && chown -R 1000:1000 /data/uploads && find /data/uploads -type f | wc -l | sed "s/$/ fichiers/"'
	else
		step "4. Pas d'archive des justificatifs (sauvegarde d'avant déploiement) : volume inchangé"
	fi
	rm -f "$key"

	step "5. Reconstruction : index de recherche, notes et compteurs, villes"
	dc run --rm --no-deps migrate pnpm -s tsx scripts/restore-rebuild.ts

	step "6. Vérification"
	local counts
	counts=$(mktemp)
	psql_db -At <"$ROOT/scripts/sql/counts.sql" >"$counts"
	sed 's/^/  /' "$counts"
	if [ -f "$src/counts.txt" ]; then
		if diff -q "$src/counts.txt" "$counts" >/dev/null; then
			echo "  mêmes chiffres qu'au moment de la sauvegarde"
		else
			echo "⚠️  chiffres différents de counts.txt (écrit juste après la sauvegarde) :"
			diff "$src/counts.txt" "$counts" | sed 's/^/  /' || true
		fi
	fi
	rm -f "$counts"
	local broken
	broken=$(psql_db -At <"$ROOT/scripts/sql/consistency.sql")
	[ -z "$broken" ] || die "base incohérente :
$broken"
	echo "  base cohérente"

	step "Démarrage du site et du worker (cache vide : sitemaps recalculés)"
	dc up -d --force-recreate app worker
	wait_healthy >/dev/null || die "le site ne répond pas : $(dc logs --tail 40 app)"
	echo "✅ restauration terminée"
}

main "$@"
