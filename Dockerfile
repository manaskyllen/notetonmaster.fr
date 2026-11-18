# syntax=docker/dockerfile:1.7
# Single Dockerfile for dev and prod.
#   target dev    -> dev image (code mounted as a volume, hot reload)
#   target build  -> full toolchain, also used by the one-shot prod "migrate" service
#   target runner -> slim production image (Next.js standalone + bundled worker)

ARG NODE_VERSION=24
ARG PNPM_VERSION=12.18.0

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
# Lets scripts/deploy.sh remove this project's dangling images, never another application's.
LABEL org.opencontainers.image.title="notetonmaster"
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && apt-get clean \
  && npm install -g pnpm@${PNPM_VERSION} \
  && npm cache clean --force
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------- dev ----------
FROM base AS dev
# git for lint-staged (pre-commit hook, run in this container).
RUN apt-get update && apt-get install -y --no-install-recommends git && apt-get clean && rm -rf /var/lib/apt/lists/*
# Named volumes inherit ownership from the image, so pre-create them for the non-root user.
RUN mkdir -p /app/node_modules /app/.next /data/uploads /data/raw \
  && chown -R node:node /app /data /home/node
ENV npm_config_store_dir=/app/node_modules/.pnpm-store
USER node
EXPOSE 3000

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
  pnpm install --frozen-lockfile --store-dir=/pnpm-store

# ---------- build ----------
FROM deps AS build
COPY . .
RUN pnpm prisma generate && pnpm build

# ---------- runner ----------
FROM node:${NODE_VERSION}-slim AS runner
LABEL org.opencontainers.image.title="notetonmaster"
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  UPLOADS_DIR=/data/uploads
WORKDIR /app
RUN mkdir -p /data/uploads /data/raw && chown -R node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/content ./content
# Fixtures replayed by the mock connectors (worker), and the source schemas checked by the real ones.
COPY --from=build --chown=node:node /app/prisma/fixtures ./prisma/fixtures
COPY --from=build --chown=node:node /app/fixtures/schemas ./fixtures/schemas
COPY --from=build --chown=node:node /app/fixtures/live/esr-etablissements/etablissements-composantes-candidats.json ./fixtures/live/esr-etablissements/
COPY --from=build --chown=node:node /app/fixtures/decisions ./fixtures/decisions
# Commit of the image (scripts/deploy.sh), shown by /api/health. Last, so it never busts the cache.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
