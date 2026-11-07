/**
 * @highcastle/sandbox — lane L14 public surface.
 *
 * L13/L16 consume `SandboxController.execute/cancel/reconcileOrphans` plus the
 * injected ports; L04/L02 implement `SandboxPolicyGate`/`RunnerRegistry`.
 * The runner program under `src/program/` is image payload, not importable
 * API — it is exported for type sharing only.
 */

export * from "./constants.ts";
export * from "./errors.ts";
export * from "./ports.ts";
export * from "./credentials.ts";
export * from "./policy.ts";
export * from "./envelope.ts";
export * from "./dockerArgs.ts";
export * from "./dockerRuntime.ts";
export * from "./output.ts";
export * from "./registry.ts";
export * from "./modelProgram.ts";
export * from "./controller.ts";
export type {
  RunnerEnvelope,
  RunnerSecrets,
  RunnerLine,
  ProbeLine,
  ProbeOutcome,
  ExchangeLine,
  AssertionLine,
  LogLine,
  ResultLine,
  StartedLine,
} from "./program/protocol.ts";
export { RUNNER_PROTOCOL_VERSION } from "./program/protocol.ts";
