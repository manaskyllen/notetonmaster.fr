#!/bin/sh
# Checks before a deploy (docs/deploiement.md, step 1), on the machine that deploys:
#   sh scripts/deploy-check.sh      (or pnpm deploy:check)
# - the working tree is clean;
# - HEAD carries a version tag (v1.2.0);
# - the CI is green on GitHub for this commit, on its push to main: there the e2e job always runs
#   the complete end-to-end suite (no path filter), so a green run means a green suite (gh when
#   installed, else the public API);
# - the migrations added since the previous tag, with a warning when one is destructive.
# Prints ✅ / ❌ and exits with 1 when a check fails. Needs only git and curl.
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
