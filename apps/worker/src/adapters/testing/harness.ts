/** Compose a fully-faked OrchestratorDeps for a test. */
import {
  CancelRegistry,
  DEFAULT_ORCHESTRATOR_CONFIG,
  type OrchestratorDeps,
} from "../../flows/deps.js";
import { InMemoryEventPublisher, InMemoryStore } from "./fakes.js";
import {
  ContractVerifier,
  InMemoryQueue,
  StubInference,
  StubPolicy,
  StubSandbox,
  ALLOW_DECISION,
  IMG_DIGEST,
  makeEnvironment,
  makeIdentity,
  makeProject,
  makeScope,
  makeScan,
  makeTarget,
  validProposalOutcome,
  ENV_PATCHED,
  ENV_VULN,
  IDENTITY_ALICE,
  PROJECT,
  SCOPE,
  TARGET,
} from "./stubs.js";
import type { HypothesisOutcome, PlanDecision, SandboxRunOutcome } from "../ports.js";
import type { Scan } from "@highcastle/contracts";

export interface Harness {
  deps: OrchestratorDeps;
  store: InMemoryStore;
  events: InMemoryEventPublisher;
  inference: StubInference;
  policy: StubPolicy;
  sandbox: StubSandbox;
  verifier: ContractVerifier;
  queue: InMemoryQueue;
  scan: Scan;
}

export function buildHarness(opts: {
  scan?: Scan;
  inferenceOutcomes?: Array<HypothesisOutcome | Error>;
  policyDecision?: PlanDecision;
  sandboxOutcome?:
    SandboxRunOutcome | ((call: number) => SandboxRunOutcome | Promise<SandboxRunOutcome>);
}): Harness {
  const store = new InMemoryStore();
  const scan = opts.scan ?? makeScan();
  store.scans.set(scan.id, scan);
  const scope = makeScope();
  store.scopes.set(SCOPE, scope);
  store.projects.set(PROJECT, makeProject());
  store.targets.set(TARGET, makeTarget());
  const vulnEnv = makeEnvironment(ENV_VULN, "lab-v1-vulnerable");
  const patchedEnv = makeEnvironment(ENV_PATCHED, "lab-v2-patched");
  store.environments.set(ENV_VULN, vulnEnv);
  store.environments.set(ENV_PATCHED, patchedEnv);
  const identity = makeIdentity();
  store.identities.set(IDENTITY_ALICE, identity);

  const events = new InMemoryEventPublisher();
  const inference = new StubInference(opts.inferenceOutcomes ?? [validProposalOutcome()]);
  const policy = new StubPolicy(opts.policyDecision ?? ALLOW_DECISION);
  const sandbox = new StubSandbox(
    opts.sandboxOutcome ??
      ((call) => {
        throw new Error(`sandbox outcome for call ${call} not configured`);
      }),
  );
  const verifier = new ContractVerifier();
  const queue = new InMemoryQueue();

  const deps: OrchestratorDeps = {
    store,
    events,
    inference,
    policy,
    sandbox,
    verifier,
    queue,
    clock: { now: () => new Date() },
    config: { ...DEFAULT_ORCHESTRATOR_CONFIG, targetImageDigest: IMG_DIGEST },
    cancelRegistry: new CancelRegistry(),
  };
  return { deps, store, events, inference, policy, sandbox, verifier, queue, scan };
}
