# syntax=docker/dockerfile:1
# HighCastle target-lab — owned, deliberately vulnerable SYNTHETIC invoice SaaS.
#
# Build exactly one revision per image; the revision is a REQUIRED build arg so
# a vulnerable image can never be produced implicitly:
#   docker build --build-arg LAB_REVISION=lab-v1-vulnerable -t highcastle/target-lab:lab-v1-vulnerable .
#   docker build --build-arg LAB_REVISION=lab-v2-patched   -t highcastle/target-lab:lab-v2-patched   .
#
# Optional provenance: --build-arg SOURCE_GIT_SHA=$(git rev-parse HEAD)
# Deployment (L19) records the immutable image digest per revision.

FROM node:24-alpine

ARG LAB_REVISION
ARG SOURCE_GIT_SHA=""

# Fail the build unless the revision is explicit and known.
RUN test "$LAB_REVISION" = "lab-v1-vulnerable" || test "$LAB_REVISION" = "lab-v2-patched" || \
    (echo "ERROR: --build-arg LAB_REVISION is required: lab-v1-vulnerable | lab-v2-patched" >&2 && exit 1)

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    TARGET_LAB_REVISION=$LAB_REVISION \
    SOURCE_GIT_SHA=$SOURCE_GIT_SHA

WORKDIR /app

# Zero runtime dependencies: Node >=22.18 runs .ts via native type stripping.
COPY package.json ./
COPY src ./src
COPY test ./test

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

CMD ["node", "src/server.ts"]
