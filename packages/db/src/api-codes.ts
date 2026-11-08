import type { z } from "zod";
import type { ApiErrorCodeSchema as ApiCode } from "@highcastle/contracts";

/**
 * Contract error codes this package can raise (via {@link DbError}).
 * Re-exported as a type so L18 can map storage failures to HTTP status
 * without depending on this package's runtime.
 */
export type ApiErrorCode = z.infer<typeof ApiCode>;
