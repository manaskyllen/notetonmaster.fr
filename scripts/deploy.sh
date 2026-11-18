#!/usr/bin/env bash
# Deploys the current main on the server, from the repository folder (docs/deploiement.md):
#
#   scripts/deploy.sh
#
# 1. refuses local changes  2. git pull --ff-only  3. images tagged with the commit
# 4. quick backup before the migrations  5. migrate service  6. up -d
# 7. waits for /api/health and prints the deployed version  8. removes the older images of
# notetonmaster, the last 2 kept for a rollback. Never touches another application's images.
set -euo pipefail
# shellcheck source=scripts/prod-env.sh
. "$(dirname "$0")/prod-env.sh"

# Removes the tagged images of a repository but the 2 most recent, and its dangling ones.
prune_images() {
	local repo=$1 tag
	docker image ls "$repo" --format '{{.CreatedAt}}|{{.Tag}}' |
		grep -v '|latest$' | grep -v '|<none>$' | sort -r | tail -n +3 | cut -d'|' -f2 |
		while read -r tag; do
			if docker image rm "$repo:$tag" >/dev/null 2>&1; then
				echo "  supprimée : $repo:$tag"
			else
				echo "  gardée (encore utilisée) : $repo:$tag"
			fi
		done
}

# The whole script is read before it runs: `git pull` may replace this very file.
main() {
	cd "$ROOT"
	step "1. Arbre de travail"
	[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || die "la branche main est attendue"
	if [ -n "$(git status --porcelain)" ]; then
		git status --short
		die "modifications locales : rien n'est déployé"
	fi

	step "2. git pull --ff-only"
	git pull --ff-only
	local sha
	sha=$(git rev-parse --short=12 HEAD)
	export IMAGE_TAG=$sha

	step "3. Images notetonmaster:$sha"
	dc build app migrate
	docker tag "notetonmaster:$sha" notetonmaster:latest
	docker tag "notetonmaster-migrate:$sha" notetonmaster-migrate:latest

	step "4. Sauvegarde rapide avant les migrations"
	dc up -d --wait postgres
	if [ "$(table_count)" = 0 ]; then
		echo "  base vide : rien à sauvegarder"
	else
		"$ROOT/scripts/backup.sh" --pre-deploy
	fi

	step "5. Migrations (service migrate)"
	dc run --rm migrate

	step "6. Démarrage"
	dc up -d --remove-orphans postgres app worker

	step "7. Santé"
	local health version
	if ! health=$(wait_healthy); then
		dc logs --tail 80 app
		die "/api/health ne répond pas : voir les journaux ci-dessus"
	fi
	version=$(printf '%s' "$health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
	[ "$version" = "$sha" ] || die "/api/health annonce la version « $version », $sha attendue"
	echo "✅ notetonmaster $version en ligne ($(git log -1 --format='%s' HEAD))"

	step "8. Anciennes images (les 2 dernières sont gardées)"
	prune_images notetonmaster
	prune_images notetonmaster-migrate
	docker image prune -f --filter 'label=org.opencontainers.image.title=notetonmaster' >/dev/null
}

main "$@"
