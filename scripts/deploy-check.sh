#!/bin/sh
# Checks before a deploy (docs/deploiement.md, step 1), on the machine that deploys:
#   sh scripts/deploy-check.sh      (or pnpm deploy:check)
# - the working tree is clean;
# - HEAD carries a version tag (v1.2.0);
# - the CI is green on GitHub for this commit, on its push to main: there the e2e job always runs
#   the complete end-to-end suite (no path filter), so a green run means a green suite (gh when
#   installed, else the public API);
# - the JavaScript budget of perf-budget.json, measured here on this commit (scripts/budget.sh:
#   production build, demo seed in its own database), in the dev image when Docker is there;
#   SKIP_BUDGET=1 skips it (the CI job build-budget measured the same commit);
# - the migrations added since the previous tag, with a warning when one is destructive.
# Prints ✅ / ❌ and exits with 1 when a check fails. Needs git and curl, and Docker (or Node) for
# the budget.
set -u
fail=0
ok() { echo "✅ $1"; }
ko() { echo "❌ $1"; fail=1; }

sha=$(git rev-parse HEAD)

if [ -z "$(git status --porcelain)" ]; then ok "arbre git propre"; else ko "arbre git modifié : commite ou range les changements"; fi

tag=$(git describe --exact-match --tags HEAD 2>/dev/null || true)
case "$tag" in
  v[0-9]*.[0-9]*.[0-9]*) ok "tag $tag sur le commit courant" ;;
  *) ko "aucun tag de version (vX.Y.Z) sur le commit courant : git tag v1.2.0 && git push --tags" ;;
esac

repo=$(git remote get-url origin 2>/dev/null | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')
conclusion=""
if command -v gh >/dev/null 2>&1; then
  conclusion=$(gh run list --repo "$repo" --commit "$sha" --workflow CI --event push --json conclusion --jq '.[0].conclusion' 2>/dev/null || true)
else
  conclusion=$(curl -fsS "https://api.github.com/repos/$repo/actions/workflows/ci.yml/runs?head_sha=$sha&event=push&per_page=1" 2>/dev/null \
    | grep -m1 '"conclusion"' | sed -E 's/.*"conclusion": *"?([a-z_]*)"?.*/\1/' || true)
fi
if [ "$conclusion" = "success" ]; then ok "CI verte pour $(echo "$sha" | cut -c1-7), suite e2e complète comprise"
else ko "CI pas verte pour $(echo "$sha" | cut -c1-7) sur main, ou suite e2e complète pas verte (${conclusion:-aucun passage trouvé})"; fi

budget_log=$(mktemp)
if [ -n "${SKIP_BUDGET:-}" ]; then
  echo "ℹ️  budget JavaScript non mesuré ici (SKIP_BUDGET) : seul le job build-budget de la CI le garantit"
elif command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  # The command of `make budget` (no make needed).
  if docker compose up -d db > "$budget_log" 2>&1 &&
    docker compose run --rm --no-deps -T -v nm_budget_next:/app/.next \
      -e ALLOW_INSECURE_LOCAL_PROD=1 -e TURNSTILE_MODE=mock -e CONNECTORS_MODE=mock \
      -e RATE_LIMIT_MULTIPLIER=20 -e RAW_DATA_DIR=/tmp/nm/raw -e UPLOADS_DIR=/tmp/nm/uploads \
      -e APP_URL=http://localhost:3099 app sh scripts/budget.sh >> "$budget_log" 2>&1; then
    ok "budget JavaScript tenu ($(grep -c ' 200 ' "$budget_log") pages sous $(sed -nE 's/.*"jsKbMax": *([0-9]+).*/\1/p' perf-budget.json) Ko)"
  else
    ko "budget JavaScript dépassé ou non mesuré :"; sed -n '/Budgets dépassés/,$p' "$budget_log" | sed 's/^/   /'; tail -n 5 "$budget_log" | sed 's/^/   /'
  fi
elif command -v node >/dev/null 2>&1 && [ -n "${DATABASE_URL:-}" ]; then
  if sh scripts/budget.sh > "$budget_log" 2>&1; then ok "budget JavaScript tenu"
  else ko "budget JavaScript dépassé ou non mesuré :"; tail -n 20 "$budget_log" | sed 's/^/   /'; fi
else
  ko "budget JavaScript non mesuré : il faut Docker (ou Node et DATABASE_URL), ou SKIP_BUDGET=1"
fi
rm -f "$budget_log"

prev=$(git describe --tags --abbrev=0 "HEAD^" 2>/dev/null || true)
if [ -n "$prev" ]; then
  migrations=$(git diff --name-only --diff-filter=A "$prev" HEAD -- 'prisma/migrations/*/migration.sql')
  if [ -z "$migrations" ]; then ok "aucune migration depuis $prev"
  else
    echo "ℹ️  migrations à appliquer depuis $prev :"
    for m in $migrations; do
      if grep -qEi 'DROP[[:space:]]+(TABLE|COLUMN)|ALTER[[:space:]]+TABLE[^;]*DROP[[:space:]]' "$m"; then
        echo "   ⚠️  $m (DESTRUCTIVE : sauvegarde vérifiée avant de déployer)"
      else echo "   - $m"; fi
    done
  fi
else
  echo "ℹ️  pas de tag précédent : toutes les migrations seront appliquées (premier déploiement)"
fi

exit $fail
