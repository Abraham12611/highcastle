# syntax=docker/dockerfile:1
# HighCastle one-shot DB migrator image (L19) — packages/db migrate-cli (L02).
#
# Build from the REPO ROOT:
#   docker build -f infra/docker/deploy/db-migrate.Dockerfile -t highcastle/db-migrate:dev .
#
# `pnpm deploy` packs @highcastle/db's `files` field, which includes `dist`
# AND `drizzle/` (the immutable numbered migrations), so the bundle is
# self-contained. Requires L02 (packages/db) merged — see deploy README.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS build
COPY . .
# `--legacy` deploy: see web.Dockerfile. packs `files` (dist + drizzle/).
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@highcastle/db..." build \
 && pnpm deploy --filter "@highcastle/db" --prod --legacy /prod/db-migrate

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/db-migrate ./
USER node
CMD ["node", "dist/migrate-cli.js"]
