import { describe, expect, it } from "vitest";
import { internalUserIdForClerk } from "./membership";
import { clerkConfigured } from "./clerk";

/**
 * Clerk → internal user mapping. Account workspace provisioning +
 * listing coverage lives in `packages/db` `account-tenancy.test.ts` and
 * `server/account.test.ts` — the E12 canonical seam (issue #72).
 */
describe("internalUserIdForClerk", () => {
  it("is deterministic and RFC-4122 shaped", () => {
    const id = internalUserIdForClerk("user_2testmapping");
    expect(internalUserIdForClerk("user_2testmapping")).toBe(id);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("different Clerk subjects map to different internal users", () => {
    expect(internalUserIdForClerk("user_alice")).not.toBe(
      internalUserIdForClerk("user_bob"),
    );
  });
});

describe("keyless demo guarantee", () => {
  it("clerkConfigured is false without a publishable key", () => {
    expect(clerkConfigured({} as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(
      clerkConfigured({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x" } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
});
