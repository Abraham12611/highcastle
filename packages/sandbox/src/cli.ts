/**
 * sandboxctl — minimal ops/verification entrypoint for the sandbox controller.
 *
 * Used by infra/docker/runner/verify-containment.sh and by L19 on the Vultr
 * host to prove the boundary end to end. NOT wired into the request path —
 * it exists for audited operator verification.
 *
 *   node dist/cli.js check        — runtime/network/image preflight report
 *   node dist/cli.js run          — execute one synthetic attempt end to end
 *   node dist/cli.js reap         — run the orphan janitor now
 *
 * Config (env, never secrets): HIGHCASTLE_RUNNER_IMAGE, HIGHCASTLE_LAB_NETWORK,
 * HIGHCASTLE_LAB_ORIGIN, HIGHCASTLE_SANDBOX_ALLOW_NONINTERNAL=1 (dev only).
 */

import { randomUUID } from "node:crypto";

import type { AttemptId, SandboxRequest, ScanId, WorkspaceId } from "@highcastle/contracts";

import { StaticSyntheticCredentialResolver, CREDENTIAL_REFS } from "./credentials.ts";
import { SandboxController } from "./controller.ts";
import { DockerCliRuntime } from "./dockerRuntime.ts";
import { InMemoryRunnerRegistry } from "./registry.ts";
import { StaticLabPolicyGate } from "./policy.ts";
import {
  DEFAULT_LAB_NETWORK,
  DEFAULT_LAB_ORIGIN,
  DEFAULT_RUNNER_IMAGE,
  NETWORK_PROFILE_ID,
} from "./constants.ts";

function envConfig() {
  return {
    runnerImage: process.env["HIGHCASTLE_RUNNER_IMAGE"] ?? DEFAULT_RUNNER_IMAGE,
    labNetwork: process.env["HIGHCASTLE_LAB_NETWORK"] ?? DEFAULT_LAB_NETWORK,
    labOrigin: process.env["HIGHCASTLE_LAB_ORIGIN"] ?? DEFAULT_LAB_ORIGIN,
    requireInternalNetwork: process.env["HIGHCASTLE_SANDBOX_ALLOW_NONINTERNAL"] !== "1",
    networkProfile: NETWORK_PROFILE_ID,
  };
}

function makeController() {
  const runtime = new DockerCliRuntime();
  return new SandboxController({
    runtime,
    registry: new InMemoryRunnerRegistry(),
    policyGate: new StaticLabPolicyGate(),
    credentialResolver: new StaticSyntheticCredentialResolver(),
    config: envConfig(),
  });
}

function demoRequest(): SandboxRequest {
  return {
    schemaVersion: 1,
    scanId: randomUUID() as ScanId,
    attemptId: randomUUID() as AttemptId,
    policyHash: "0".repeat(64),
    packId: "bola-invoice-v1",
    packVersion: "1.0.0",
    targetServiceAlias: "target-lab",
    actorCredentialRef: CREDENTIAL_REFS.alice,
    nonce: randomUUID().replaceAll("-", ""),
    permittedMethods: ["GET"],
    limits: {
      maxDurationSeconds: 30,
      maxRequests: 8,
      maxMemoryMb: 256,
      maxCpuMillicores: 500,
      maxPids: 32,
    },
    targetImageDigest: process.env["HIGHCASTLE_LAB_IMAGE_DIGEST"] ?? "local:dev-unpinned",
  };
}

async function main(): Promise<number> {
  const [, , command] = process.argv;
  const controller = makeController();
  const runtime = new DockerCliRuntime();
  const config = envConfig();

  switch (command) {
    case "check": {
      const available = await runtime.isAvailable();
      const net = await runtime.networkInfo(config.labNetwork);
      process.stdout.write(
        `${JSON.stringify(
          {
            dockerAvailable: available,
            labNetwork: { name: config.labNetwork, ...net },
            requireInternalNetwork: config.requireInternalNetwork,
            runnerImage: config.runnerImage,
            labOrigin: config.labOrigin,
          },
          null,
          2,
        )}\n`,
      );
      return available && net.exists ? 0 : 1;
    }
    case "run": {
      const request = demoRequest();
      const workspaceId = randomUUID() as WorkspaceId;
      const execution = await controller.execute(request, { workspaceId });
      process.stdout.write(`${JSON.stringify(execution, null, 2)}\n`);
      return execution.kind === "executed" && execution.outcome === "completed" ? 0 : 1;
    }
    case "reap": {
      const report = await controller.reconcileOrphans();
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return report.errors.length === 0 ? 0 : 1;
    }
    default:
      process.stderr.write("usage: node dist/cli.js <check|run|reap>\n");
      return 2;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`sandboxctl: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
