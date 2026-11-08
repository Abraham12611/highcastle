import { describe, expect, it } from "vitest";
import {
  GITHUB_READ_TOOLS,
  createGithubSession,
  githubAuthConfigId,
  githubConnectionState,
} from "./composio";

/**
 * Live Composio integration proof — REAL API calls, no mocks.
 * Skipped automatically when COMPOSIO_API_KEY is absent (CI without
 * secrets); run locally with the key to verify the managed-auth
 * session + auth-link chain end to end.
 */

const hasKey = !!process.env.COMPOSIO_API_KEY;

describe("composio live integration", () => {
  it.skipIf(!hasKey)(
    "creates a least-privilege session and an auth link",
    async () => {
      const session = await createGithubSession("hc-integration-test-user");
      expect(session.sessionId).toMatch(/^trs_/);

      const req = await session.authorize("github", {
        callbackUrl: "http://localhost:3000/app/integrations/github",
      });
      expect(req.redirectUrl).toMatch(/^https:\/\/connect\.composio\.dev\/link\//);

      const state = await githubConnectionState(session);
      expect(state.isActive).toBe(false); // pending until user completes OAuth
    },
    60_000,
  );

  it("pins the managed auth config and read-only tool allowlist", () => {
    expect(githubAuthConfigId()).toBeTruthy();
    for (const slug of GITHUB_READ_TOOLS) {
      expect(slug).toMatch(/^GITHUB_(GET|LIST|SEARCH)/);
      expect(slug).not.toMatch(/CREATE|UPDATE|DELETE|MERGE|PUSH|WRITE/i);
    }
  });
});
