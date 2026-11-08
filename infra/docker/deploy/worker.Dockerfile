# syntax=docker/dockerfile:1
# HighCastle worker image (L19) — pg-boss orchestrator + trusted sandbox
# controller. Build from the REPO ROOT:
#   docker build -f infra/docker/deploy/worker.Dockerfile -t highcastle/worker:dev .
#
# `--filter "@highcastle/worker..."` (trailing dots) builds the worker AND its
# workspace dependencies (contracts, db, sandbox, ...) so `pnpm deploy` can
# pack them as normal deps into a self-contained /prod/worker bundle.
#
# The runtime carries the docker CLI because the trusted SandboxController's
# DockerCliRuntime shells out to `docker` against the HOST daemon (the
# compose service mounts /var/run/docker.sock into THIS service only).
# The container runs as uid 0 deliberately: once a service can create host
# containers, a non-root uid is cosmetic — the honest control is that ONLY
# this service gets the socket, it has no published port, and the ephemeral
# runners it creates are hard-contained (see compose.yaml + L14 dockerArgs).

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@10.34.9 --activate
WORKDIR /app

FROM base AS build
COPY . .
# `--legacy` deploy: see web.Dockerfile — avoids needing inject-workspace-
# packages in the L01-owned root config; packs workspace deps as normal deps.
RUN pnpm install --frozen-lockfile \
 && pnpm --filter "@highcastle/worker..." build \
 && pnpm deploy --filter "@highcastle/worker" --prod --legacy /prod/worker

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    WORKER_PORT=3010
# docker-cli only (client binary) — the daemon stays on the host.
RUN apk add --no-cache docker-cli
WORKDIR /app
COPY --from=build /prod/worker ./
EXPOSE 3010
CMD ["node", "dist/index.js"]
