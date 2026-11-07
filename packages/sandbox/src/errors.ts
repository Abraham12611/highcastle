/** Typed controller errors. Denials are outcomes, not exceptions. */

export class SandboxError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
  }
}

/** Container runtime missing, network absent/insecure, image pull failed. */
export class SandboxUnavailableError extends SandboxError {
  constructor(message: string) {
    super("sandbox_unavailable", message);
    this.name = "SandboxUnavailableError";
  }
}

/** Credential ref could not be resolved to a synthetic lab token. */
export class CredentialResolutionError extends SandboxError {
  constructor(ref: string) {
    super("credential_resolution", `credential ref ${JSON.stringify(ref)} is not resolvable`);
    this.name = "CredentialResolutionError";
  }
}
