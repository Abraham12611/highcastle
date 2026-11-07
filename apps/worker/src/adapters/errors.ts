/**
 * Orchestrator error taxonomy.
 *
 * Two families, deliberately distinct:
 * - `IntegrationBlockedError`: a dependency package has not merged yet.
 *   Failing loudly (and naming the blocking PR) is honest; a silent
 *   substitute would masquerade as a working integration.
 * - `ScanStateConflictError`: the durable state machine rejected a
 *   transition (terminal row, concurrent writer, illegal edge). Expected
 *   under at-least-once job delivery — handlers catch and skip.
 */
export class IntegrationBlockedError extends Error {
  readonly lane: string;
  readonly blocker: string;

  constructor(lane: string, blocker: string, detail?: string) {
    super(
      `[orchestrator] ${lane} integration blocked by ${blocker}` + (detail ? `: ${detail}` : ""),
    );
    this.name = "IntegrationBlockedError";
    this.lane = lane;
    this.blocker = blocker;
  }
}

export class ScanStateConflictError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(detail);
    this.name = "ScanStateConflictError";
    this.detail = detail;
  }
}

/** Thrown by flow code to request a bounded job retry via the queue. */
export class RetryableStepError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "RetryableStepError";
  }
}
