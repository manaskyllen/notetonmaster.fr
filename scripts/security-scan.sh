#!/bin/sh
# Local security scan, the same tools as the CI (pnpm security:scan): gitleaks on the whole
# history, pnpm audit (production), Semgrep. Runs the tools in Docker: nothing installed globally.
set -u
fail=0
echo "— gitleaks (tout l'historique)"
docker run --rm -v "$PWD":/repo:ro zricethezav/gitleaks:v8.28.0 git /repo --config /repo/.gitleaks.toml --redact --log-opts="--all" || fail=1
echo "— pnpm audit --prod"
docker compose run --rm --no-deps -T app pnpm audit --prod --audit-level=high || fail=1
echo "— Semgrep"
docker run --rm -v "$PWD":/src:ro semgrep/semgrep:1.140.0 semgrep scan --metrics=off --error --severity ERROR \
  --config p/owasp-top-ten --config p/nextjs --config p/typescript --exclude lib/db/generated /src || fail=1
[ $fail -eq 0 ] && echo "✅ scan de sécurité propre" || echo "❌ scan de sécurité : à corriger"
exit $fail
