# syntax=docker/dockerfile:1
# HighCastle web/control-plane image (L19) — Next.js app + API + SSE.
#
# Build from the REPO ROOT (pnpm workspace is required to resolve catalogs):
#   docker build -f infra/docker/deploy/web.Dockerfile -t highcastle/web:dev .
#
# Layout strategy: `next build` with `output: "standalone"` emits
# .next/standalone — a self-contained server.js + traced node_modules that
# materializes Turbopack hashed externals (e.g. pg-<hash> resolved through
# @highcastle/db's nested pnpm path). A `pnpm deploy` bundle does NOT carry
# those hashed dirs and the runtime dies with ERR_MODULE_NOT_FOUND on every
# protected route — standalone is required, not optional.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@highcastle/web" build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
# Standalone tree: apps/web/server.js + apps/web/.next (+ hashed externals),
# plus static assets and public/ which standalone deliberately omits.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# Standalone server serves the build directly; Caddy proxies :443 -> here.
CMD ["node", "apps/web/server.js"]
