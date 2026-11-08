# syntax=docker/dockerfile:1
# HighCastle ephemeral test-pack runner (lane L14).
#
# Build from the REPO ROOT so the build can copy the runner program out of
# packages/sandbox (the program is kept there so it is typechecked, linted and
# unit-tested with the rest of the package):
#
#   pnpm --filter @highcastle/sandbox build          # emits dist/program/*.js
#   docker build -f infra/docker/runner/Dockerfile -t highcastle/runner:0.1.0 .
#
# The image contains ONLY the fixed runner program — no shell entrypoint, no
# package installs at run time, no credentials, no network tooling beyond what
# Node stdlib provides. All hardening (non-root, read-only rootfs, cap-drop,
# resource caps, internal network) is applied by the controller's
# `docker create` flags — see packages/sandbox/src/dockerArgs.ts — NOT by
# anything inside the image, so the boundary does not depend on image trust.

FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /runner

# Compiled program only. `import type` specifiers to @highcastle/contracts are
# erased at build time — the image needs (and contains) zero node_modules.
COPY packages/sandbox/dist/program ./program
COPY infra/docker/runner/package.json ./package.json

USER node

# The controller starts the container with `-i` and feeds the RunnerEnvelope
# over stdin; the program writes NDJSON evidence to stdout and exits.
# No CMD argv is ever taken from a request — the program is fixed.
ENTRYPOINT ["node", "program/main.js"]
