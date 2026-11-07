# syntax=docker/dockerfile:1
# HighCastle web/control-plane image (L19) — Next.js app + API + SSE.
#
# Build from the REPO ROOT (pnpm workspace is required to resolve catalogs):
#   docker build -f infra/docker/deploy/web.Dockerfile -t highcastle/web:dev .
#
# Layout strategy: `pnpm deploy` produces a self-contained /prod/web bundle —
# package files + PRODUCTION node_modules with workspace deps packed — so the
# runtime image ships no devDependencies, no sources of other packages and no
# pnpm store. `.next` is build output and is not part of the package's
# publishable file set, so it is copied over the bundle explicitly.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS build
COPY . .
# `--legacy`: pnpm 10's default deploy requires inject-workspace-packages=true
# in the root workspace config (L01-owned, not ours to change); legacy deploy
# produces the same self-contained prod bundle without it.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@highcastle/web" build \
 && pnpm deploy --filter "@highcastle/web" --prod --legacy /prod/web \
 && cp -r apps/web/.next /prod/web/.next \
 && mkdir -p /prod/web/public

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /prod/web ./
USER node
EXPOSE 3000
# `next start` serves the production build; Caddy proxies :443 -> here.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
