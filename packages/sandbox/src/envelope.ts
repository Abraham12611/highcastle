/**
 * Runner envelope construction — the only payload the runner ever receives.
 *
 * The envelope travels over the container's stdin (attached at `docker
 * start -ai`). Nothing secret goes on argv or env: `docker inspect`,
 * `docker logs` and proc environ files would all expose them.
 */

import type { SandboxRequest } from "@highcastle/contracts";

import type { RunnerEnvelope } from "./program/protocol.ts";
import { RUNNER_PROTOCOL_VERSION } from "./program/protocol.ts";
import type { RunnerInstanceId } from "@highcastle/contracts";

export function buildRunnerEnvelope(params: {
  runnerId: RunnerInstanceId;
  labOrigin: string;
  request: SandboxRequest;
  actorBearerToken: string;
  /** Pattern A: authorized model-authored source (validated + sha-pinned). */
  program?: { language: "js-subset-v1"; source: string };
}): RunnerEnvelope {
  return {
    protocolVersion: RUNNER_PROTOCOL_VERSION,
    runnerId: params.runnerId,
    labOrigin: params.labOrigin,
    request: params.request,
    secrets: { actorBearerToken: params.actorBearerToken },
    ...(params.program !== undefined ? { program: params.program } : {}),
  };
}

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /lab-token-[a-z0-9-]+/i,
  /lab-session-[a-z0-9-]+/i,
];

/**
 * Guard: the serialized envelope is the ONLY place the token may appear.
 * Used by tests to assert the token never leaks into docker args, env or
 * labels — and by the controller to refuse a malformed token early.
 */
export function envelopeContainsSecret(serialized: string): boolean {
  return SECRET_VALUE_PATTERNS.some((p) => p.test(serialized));
}

export function serializeEnvelope(envelope: RunnerEnvelope): string {
  return JSON.stringify(envelope);
}
