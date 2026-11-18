#!/usr/bin/env bash
# Tests of the production stack, on a machine with Docker and age (CI job « deploiement », or by
# hand: scripts/test-deploy.sh). Never touches the dev stack or a real server: its own project
# names, network and throwaway secrets.
#
# 1. docker-compose.prod.yml: valid, no published port, only `app` on the proxy network.
# 2. deploy/caddy/notetonmaster.caddy: `caddy validate` in a test gateway.
# 3. An empty database with a production configuration: every city closed, no demo data, the
#    site answers; PUBLIC_INDEXING false then true.
# 4. backup.sh then restore.sh into a new database: the same figures before and after.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
NET=nm-test-gateway
export IMAGE_TAG=deploy-test
PROJECTS=(nm-test-empty nm-test-backup)

cleanup() {
	local p
	for p in "${PROJECTS[@]}"; do
		ENV_FILE="$WORK/$p.env" docker compose -p "$p" --env-file "$WORK/$p.env" -f "$ROOT/docker-compose.prod.yml" \
			down -v --remove-orphans >/dev/null 2>&1 || true
	done
	docker network rm "$NET" >/dev/null 2>&1 || true
	rm -rf "$WORK"
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$*"; }
die() {
	printf '❌ %s\n' "$*" >&2
	exit 1
}
dct() { ENV_FILE="$WORK/$1.env" docker compose -p "$1" --env-file "$WORK/$1.env" -f "$ROOT/docker-compose.prod.yml" "${@:2}"; }
sql() { dct "$1" exec -T postgres psql -X -At -U notetonmaster -d notetonmaster -c "$2"; }
http() {
	docker run --rm --network "$NET" -v "$ROOT/scripts/test-deploy-http.mjs:/check.mjs:ro" \
		--entrypoint node "notetonmaster:$IMAGE_TAG" /check.mjs http://notetonmaster-app:3000 "$1"
}

command -v age-keygen >/dev/null || die "age manque (apt install age)"
age-keygen -o "$WORK/backup.key" 2>/dev/null
RECIPIENT=$(age-keygen -y "$WORK/backup.key")

# Throwaway values, generated here: nothing secret is ever written in the repository.
common_env() {
	cat <<EOF
POSTGRES_USER=notetonmaster
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=notetonmaster
APP_DB_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
APP_ENCRYPTION_KEY=$(openssl rand -base64 32)
PROXY_NETWORK=$NET
TRUSTED_PROXY_HOPS=1
MAIL_FROM="notetonmaster <ne-pas-repondre@notetonmaster.fr>"
CONTACT_EMAIL=contact@notetonmaster.fr
CRAWLER_INFO_URL=https://notetonmaster.fr/a-propos#notre-robot
CRAWLER_CONTACT_EMAIL=robot@notetonmaster.fr
BACKUP_AGE_RECIPIENT=$RECIPIENT
BACKUP_DIR=$WORK/backups
PRISMA_HIDE_UPDATE_MESSAGE=1
EOF
}
# A real production configuration (lib/env.ts accepts it), with fake keys and no mail server.
{
	common_env
	cat <<EOF
APP_URL=https://notetonmaster.fr
PUBLIC_INDEXING=false
TURNSTILE_MODE=live
TURNSTILE_SITE_KEY=0x4AAAAAAAdeploytestsite
TURNSTILE_SECRET_KEY=0x4AAAAAAAdeploytestsecret
SMTP_HOST=smtp.invalid
SMTP_USER=ne-pas-repondre@notetonmaster.fr
CONNECTORS_MODE=live
EOF
} >"$WORK/nm-test-empty.env"
# A production build on this machine, with the demo data (ALLOW_INSECURE_LOCAL_PROD, lib/env.ts).
{
	common_env
	cat <<EOF
APP_URL=http://app:3000
ALLOW_INSECURE_LOCAL_PROD=1
TURNSTILE_MODE=mock
CONNECTORS_MODE=mock
SMTP_HOST=
EOF
} >"$WORK/nm-test-backup.env"

step "1. docker-compose.prod.yml"
cfg=$(dct nm-test-empty config --format json)
[ "$(jq -r .name <<<"$(ENV_FILE="$WORK/nm-test-empty.env" docker compose --env-file "$WORK/nm-test-empty.env" -f "$ROOT/docker-compose.prod.yml" config --format json)")" = notetonmaster ] ||
	die "nom de projet : notetonmaster attendu"
published=$(jq '[.services[] | select(.ports != null and (.ports | length) > 0)] | length' <<<"$cfg")
[ "$published" = 0 ] || die "$published service(s) publient un port"
on_proxy=$(jq -r --arg n "$NET" '[.services | to_entries[] | select(.value.networks | has("proxy")) | .key] | join(",")' <<<"$cfg")
[ "$on_proxy" = app ] || die "seul app rejoint le réseau du proxy (trouvé : $on_proxy)"
jq -e '.services.app.networks.proxy.aliases == ["notetonmaster-app"]' <<<"$cfg" >/dev/null || die "alias notetonmaster-app manquant"
jq -e --arg n "$NET" '.networks.proxy.external and .networks.proxy.name == $n' <<<"$cfg" >/dev/null || die "réseau du proxy externe attendu"
for s in app worker postgres; do
	jq -e --arg s "$s" '.services[$s].mem_limit != null and .services[$s].cpus != null' <<<"$cfg" >/dev/null || die "$s sans limite de ressources"
done
jq -e '[.services[] | .logging.driver == "json-file" and .logging.options["max-size"] != null and .logging.options["max-file"] != null] | all' <<<"$cfg" >/dev/null || die "rotation des journaux manquante"
echo "✅ aucun port publié, seul app sur $NET (alias notetonmaster-app), limites et rotation des journaux"

step "2. caddy validate (passerelle de test)"
mkdir -p "$WORK/caddy/sites"
cp "$ROOT/deploy/caddy/notetonmaster.caddy" "$WORK/caddy/sites/"
cat >"$WORK/caddy/Caddyfile" <<'EOF'
{
	email acme@example.org
}

(maintenance) {
	handle_errors 502 503 504 {
		header Retry-After 120
		header Cache-Control no-store
		root * /srv/errors
		rewrite * /maintenance.html
		file_server {
			status 503
		}
	}
}

import sites/*.caddy
EOF
docker run --rm -v "$WORK/caddy:/etc/caddy:ro" caddy:2.10 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
grep -qE '^\s*(log|trusted_proxies|header)\b' "$ROOT/deploy/caddy/notetonmaster.caddy" &&
	die "notetonmaster.caddy : ni log, ni trusted_proxies, ni en-tête ajouté"
echo "✅ configuration Caddy valide"

step "Images notetonmaster:$IMAGE_TAG"
docker network create "$NET" >/dev/null
dct nm-test-empty build app migrate

step "3. Base vide, configuration de production"
dct nm-test-empty up -d --wait postgres
dct nm-test-empty run --rm migrate
[ "$(sql nm-test-empty 'SELECT count(*) FROM "LaunchZone"')" -ge 3 ] || die "villes de lancement absentes"
[ "$(sql nm-test-empty 'SELECT count(*) FROM "LaunchZone" WHERE open')" = 0 ] || die "une ville est ouverte"
for t in Program Review Student AdminUser ActivitySnapshot; do
	[ "$(sql nm-test-empty "SELECT count(*) FROM \"$t\"")" = 0 ] || die "$t n'est pas vide : données créées en production"
done
echo "✅ toutes les villes fermées, aucune donnée de démo, aucun compte"
dct nm-test-empty up -d --wait app
http off
sed -i 's/^PUBLIC_INDEXING=false$/PUBLIC_INDEXING=true/' "$WORK/nm-test-empty.env"
dct nm-test-empty up -d --wait --force-recreate app
http on
dct nm-test-empty down -v >/dev/null 2>&1

step "4. Sauvegarde puis restauration"
dct nm-test-backup up -d --wait postgres
dct nm-test-backup run --rm migrate
dct nm-test-backup run --rm migrate pnpm -s db:seed --force >/dev/null
dct nm-test-backup up -d --wait app
docker run --rm -v nm-test-backup_uploads:/data/uploads --entrypoint sh postgres:17-alpine \
	-c 'mkdir -p /data/uploads/test && echo justificatif > /data/uploads/test/piece.txt && chown -R 1000:1000 /data/uploads'
export ENV_FILE=$WORK/nm-test-backup.env COMPOSE_PROJECT_NAME=nm-test-backup
"$ROOT/scripts/backup.sh"
before=$(sql nm-test-backup "$(cat "$ROOT/scripts/sql/counts.sql")")
while read -r l; do echo "  avant : $l"; done <<<"$before"
[ "$(sql nm-test-backup 'SELECT count(*) FROM "Review" WHERE status = '"'PUBLISHED'"'')" -gt 0 ] || die "le seed n'a pas d'avis publié"
backup=$(find "$WORK/backups/daily" -mindepth 1 -maxdepth 1 -type d | head -n 1)

# A new server: nothing left but the backup.
dct nm-test-backup down -v >/dev/null 2>&1
dct nm-test-backup up -d --wait postgres
"$ROOT/scripts/restore.sh" "$backup" <"$WORK/backup.key"
after=$(sql nm-test-backup "$(cat "$ROOT/scripts/sql/counts.sql")")
while read -r l; do echo "  après : $l"; done <<<"$after"
[ "$before" = "$after" ] || die "les chiffres diffèrent avant et après la restauration"
restored=$(docker run --rm -v nm-test-backup_uploads:/data/uploads:ro --entrypoint cat postgres:17-alpine /data/uploads/test/piece.txt)
[ "$restored" = justificatif ] || die "justificatif non restauré"
# A second restore into the same (no longer empty) database is refused.
if "$ROOT/scripts/restore.sh" "$backup" <"$WORK/backup.key" >/dev/null 2>&1; then
	die "restore.sh a accepté une base qui n'est pas vide"
fi
echo "✅ mêmes chiffres avant et après, justificatifs restaurés, base non vide refusée"

printf '\n✅ pile de production : tous les tests passent\n'
