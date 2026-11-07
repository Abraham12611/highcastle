/**
 * Controller constants — compile-time, never derived from requests or model
 * output. Docker flags, label names, network/image defaults live here so the
 * entire containment profile is reviewable in one place.
 */

/** Docker label namespace the controller owns; used by the janitor filter. */
export const LABEL_MANAGED_BY = "highcastle.managed-by";
export const LABEL_MANAGED_BY_VALUE = "l14-sandbox-controller";
export const LABEL_RUNNER_ID = "highcastle.runner-id";
export const LABEL_WORKSPACE_ID = "highcastle.workspace-id";
export const LABEL_SCAN_ID = "highcastle.scan-id";
export const LABEL_ATTEMPT_ID = "highcastle.attempt-id";
export const LABEL_POLICY_HASH = "highcastle.policy-hash";
/** Unix-epoch deadline after which an orphaned container is reaped. */
export const LABEL_EXPIRES_AT = "highcastle.expires-at";

/** Container name prefix (Docker-safe charset). */
export const RUNNER_NAME_PREFIX = "hc-sb-";

/** Default runner image; deployments should pin a digest via config. */
export const DEFAULT_RUNNER_IMAGE = "highcastle/runner:0.1.0";

/**
 * Dedicated runner-facing INTERNAL network the runner joins (and nothing
 * else). This is deliberately NOT L11's `highcastle-lab` compose network:
 * the lab container is dual-homed onto `highcastle-runner` by deployment
 * (L19) or by verify-containment.sh, so the runner reaches the lab while
 * having no outbound route — without modifying L11-owned compose files.
 */
export const DEFAULT_LAB_NETWORK = "highcastle-runner";

/** The only service alias the runner can resolve/reach on that network. */
export const DEFAULT_LAB_ORIGIN = "http://target-lab:3000";

/** Network profile name recorded on RunnerInstance rows. */
export const NETWORK_PROFILE_ID = "lab-internal-only-v1";

/** Non-root uid/gid inside the runner image (node user). */
export const RUNNER_UID = 1000;
export const RUNNER_GID = 1000;

/** Writable scratch: the only writable path in the runner. */
export const RUNNER_TMPFS = "/tmp:rw,noexec,nosuid,nodev,size=64m";

/** Grace period added to limits.maxDurationSeconds before SIGKILL. */
export const TIMEOUT_GRACE_MS = 5_000;

/** Environment keys permitted in the runner. Anything else is stripped. */
export const RUNNER_ENV: readonly string[] = ["HOME=/tmp", "NODE_ENV=production"];
