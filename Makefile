# notetonmaster — everything runs in Docker.
DC      := docker compose
# The production stack tried on this machine: its own project name (the dev stack is also
# « notetonmaster ») and .env.prod (cp .env.prod.example .env.prod, local values).
DC_PROD := docker compose -p notetonmaster-prod --env-file .env.prod -f docker-compose.prod.yml
RUN     := $(DC) run --rm --no-deps app

.PHONY: budget analyze e2e-full test-int seo-check data-univ-sites-preview data-replay-origins prod-local perf vitals lhci sectors prod-logs data-national-preview data-replay-pilot totp help env dev down logs install seed reset migration restart test check typecheck lint e2e shell tokens prod-build prod-up prod-down

help: ## List targets
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || (cp .env.example .env && echo "Created .env from .env.example")

dev: env ## Start the dev stack (site :3000, Mailpit :8025)
	$(DC) up --build

down: ## Stop the dev stack
	$(DC) down

logs: ## Follow logs
	$(DC) logs -f

install: env ## Install dependencies in the node_modules volume
	$(DC) run --rm --no-deps migrate pnpm install

seed: env ## Replay the seed
	$(DC) run --rm migrate pnpm db:seed --force

reset: env ## Drop the database, replay migrations and seed
	$(DC) run --rm migrate sh -c "pnpm install --frozen-lockfile && pnpm prisma generate && pnpm prisma migrate reset --force && pnpm db:seed --force"

migration: env ## Create a migration from schema changes: make migration name=add_x
	$(DC) run --rm migrate sh -c "pnpm prisma migrate dev --name $(name)"
	@# The dev server keeps its Prisma client in memory: restart it on the new schema.
	$(MAKE) restart

restart: env ## Restart app and worker on a clean Next.js cache (after a migration or a stuck reload loop)
	$(DC) stop app worker
	$(DC) run --rm --no-deps app sh -c "rm -rf /app/.next/* /app/.next/.[!.]* 2>/dev/null; true"
	$(DC) up -d app worker

tokens: env ## Regenerate styles/tokens.css from styles/tokens.json
	$(RUN) pnpm tokens

typecheck: env
	$(RUN) sh -c "pnpm prisma generate >/dev/null && pnpm typecheck"

lint: env
	$(RUN) pnpm lint

test: env ## Unit tests (Vitest, no database)
	$(DC) run --rm --no-deps app pnpm test

test-int: env ## Integration tests (Vitest, dev database with the seed)
	$(DC) run --rm app pnpm test:int

check: env ## typecheck + lint + unit tests
	$(DC) run --rm app sh -c "pnpm prisma generate >/dev/null && pnpm typecheck && pnpm lint && pnpm test"

e2e: env ## End-to-end tests (Playwright) against the dev stack
	$(DC) --profile e2e run --rm e2e

# The variables of the CI (public test values): a production build on the demo data.
E2E_ENV := -e ALLOW_INSECURE_LOCAL_PROD=1 -e TURNSTILE_MODE=mock -e CONNECTORS_MODE=mock \
	-e RATE_LIMIT_MULTIPLIER=20 -e RAW_DATA_DIR=/tmp/nm/raw -e UPLOADS_DIR=/tmp/nm/uploads \
	-e SMTP_HOST=mailpit -e SMTP_PORT=1025 -e E2E_SERVERS=$(or $(servers),4)

e2e-full: env ## Complete end-to-end suite as in the CI (production build, 4 servers and databases): make e2e-full args="tests/e2e/03-review-without-account.spec.ts"
	$(DC) run --rm --no-deps -v nm_e2e_next:/app/.next app sh -c "pnpm -s prisma generate >/dev/null && pnpm -s build"
	$(DC) --profile e2e run --rm --no-deps -v nm_e2e_next:/app/.next $(E2E_ENV) e2e \
		sh -c 'mkdir -p /tmp/nm/raw /tmp/nm/uploads && sh scripts/e2e-stack.sh run --project=e2e --project=mobile-iphone --project=mobile-android $(args)'

prod-local: env ## Production build of the working tree against the dev database (national data), on :3002
	-docker rm -f nm-prodlocal >/dev/null 2>&1
	docker volume create nm_prodnext >/dev/null
	docker run -d --name nm-prodlocal --network notetonmaster_default --env-file .env -e NODE_ENV=production -e ALLOW_INSECURE_LOCAL_PROD=1 -e APP_URL=http://localhost:3002 -v "$(PWD)":/app -v notetonmaster_node_modules:/app/node_modules -v nm_prodnext:/app/.next -w /app -p 127.0.0.1:3002:3000 --user 1000:1000 notetonmaster-dev sh -c "pnpm -s prisma generate >/dev/null && pnpm next build && sh scripts/standalone-site.sh /tmp/nm-site && cd /tmp/nm-site && PORT=3000 HOSTNAME=0.0.0.0 node server.js"
	@echo "Production locale : http://localhost:3002 (docker logs -f nm-prodlocal)"

perf: env ## Light load on the key routes of make prod-local: TTFB p50/p95/p99, HTML and JS weight (performance budgets)
	$(DC) --profile e2e run --rm -T e2e node scripts/perf.mjs --base=http://nm-prodlocal:3000 --n=20 --c=2 --assert --json=docs/perf/latest.json

budget: env ## JavaScript budget as in the CI (job build-budget): production build, demo seed in its own database, perf.mjs --js-only --assert
	$(DC) up -d db
	$(DC) run --rm --no-deps -T -v nm_budget_next:/app/.next $(E2E_ENV) -e APP_URL=http://localhost:3099 app sh scripts/budget.sh

analyze: env ## Heaviest modules of the browser JavaScript (Turbopack analysis of a production build)
	$(DC) run --rm --no-deps -T -v nm_budget_next:/app/.next app pnpm -s analyze

vitals: env ## LCP and INP on a mobile profile (4G, CPU ×4) against make prod-local
	$(DC) --profile e2e run --rm -T e2e node scripts/web-vitals.mjs --base=http://nm-prodlocal:3000 --runs=3 --assert --json=docs/perf/latest-vitals.json

lhci: env ## Lighthouse CI on make prod-local (mobile; fails under Performance 90, SEO 100, LCP 2.5 s, CLS 0.1)
	$(DC) --profile e2e run --rm -T -e LHCI_BASE_URL=http://nm-prodlocal:3000 e2e sh -c 'CHROME_PATH=$$(ls -d /ms-playwright/chromium-*/chrome-linux*/chrome | head -1) npx --yes @lhci/cli@0.14.0 autorun --config=lighthouserc.cjs'

seo-check: env ## SEO check of make prod-local from its sitemap (titles, canonicals, noindex, JSON-LD, h1, broken links, orphans)
	$(DC) run --rm --no-deps -T app pnpm -s seo:check --url=http://nm-prodlocal:3000

sectors: env ## Recompute public / private sector of establishments from the annuaire, then the search index
	$(DC) run --rm app pnpm -s tsx scripts/refresh-sectors.ts

totp: env ## Current TOTP code of a demo admin: make totp email=alexis@notetonmaster.example
	@$(DC) run --rm --no-deps -T app pnpm -s tsx scripts/totp.ts $(email)

shell: env ## Shell in the app container
	$(DC) run --rm app sh

prod-build: ## Build the production images (on the server: scripts/deploy.sh)
	$(DC_PROD) build app migrate

prod-up: ## Start the production stack locally (no published port: reached through the PROXY_NETWORK network)
	docker network inspect $${PROXY_NETWORK:-gateway} >/dev/null 2>&1 || docker network create $${PROXY_NETWORK:-gateway}
	$(DC_PROD) up -d --wait postgres
	$(DC_PROD) run --rm migrate
	$(DC_PROD) up -d app worker

prod-logs: ## Logs of the local production stack
	$(DC_PROD) logs -f app worker

prod-down: ## Stop the local production stack
	$(DC_PROD) down

data-national-preview: env ## Real connectors, PREVIEW only (nothing published): establishments then Mon Master, whole France
	$(DC) exec -T -e CONNECTORS_MODE=live worker pnpm -s tsx scripts/data-run.ts esr-etablissements preview
	$(DC) exec -T -e CONNECTORS_MODE=live worker pnpm -s tsx scripts/data-run.ts monmaster-opendata preview

data-univ-sites-preview: env ## Programs from the university sites, PREVIEW only: make data-univ-sites-preview templates=AMETYS_ODF_HTML,KSUP
	$(DC) exec -T -e CONNECTORS_MODE=live worker pnpm -s tsx scripts/data-run.ts univ-sites preview $(if $(templates),--templates $(templates))

data-replay-origins: env ## « D'où viennent les admis »: replays origins and accepted counts from the Mon Master snapshots already downloaded (no network)
	$(DC) exec -T worker pnpm -s tsx scripts/replay-admission-origins.ts

data-replay-pilot: env ## Replays the Mon Master pilot extracts (fixtures/live) without network: make data-replay-pilot mode=preview|apply
	$(DC) exec -T -e CONNECTORS_MODE=live worker pnpm -s tsx scripts/data-replay.ts monmaster-opendata fixtures/live/monmaster-opendata $(or $(mode),preview)
