/**
 * Typed errors for the event transport. `code` maps to HTTP status at the
 * route layer; messages are safe to log but only `safeMessage` (or a generic
 * envelope) may reach the browser.
 */
export class EventStoreError extends Error {
  readonly code: "not_found" | "conflict" | "unavailable";

  constructor(code: EventStoreError["code"], message: string) {
    super(message);
    this.name = "EventStoreError";
    this.code = code;
  }
}

export class EventValidationError extends Error {
  readonly code = "validation_error" as const;

  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}
