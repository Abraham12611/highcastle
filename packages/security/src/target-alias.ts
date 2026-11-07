import {
  TargetServiceAliasSchema,
  type Target,
  type TargetServiceAlias,
} from "@highcastle/contracts";
import { denyReason, type PolicyDenyReason } from "./decisions.js";

/**
 * Restricted demo target-alias validation.
 *
 * For the hackathon the only executable target is the owned synthetic invoice
 * lab, reached inside the sandbox network via the fixed alias `target-lab`.
 * No URL or hostname the model, the client, or a redirect can supply may ever
 * reach the runner — the controller resolves this alias to a compose-network
 * service only. Any target whose `targetKind` is not `demo` cannot produce
 * an alias at all.
 */

export function resolveTargetServiceAlias(
  target: Pick<Target, "targetKind">,
): TargetServiceAlias | null {
  if (target.targetKind !== "demo") return null;
  const alias = TargetServiceAliasSchema.safeParse("target-lab");
  return alias.success ? alias.data : null;
}

export function checkTargetAliasPermitted(target: Pick<Target, "targetKind">): PolicyDenyReason[] {
  if (resolveTargetServiceAlias(target) === null) {
    return [
      denyReason(
        "unsupported_target_kind",
        `target kind ${JSON.stringify(target.targetKind)} has no executable service alias; only the owned demo lab may run`,
      ),
    ];
  }
  return [];
}
