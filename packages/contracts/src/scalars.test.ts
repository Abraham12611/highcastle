import { describe, expect, it } from "vitest";
import { ScanIdSchema, WorkspaceIdSchema } from "./ids.js";
import {
  IsoUtcDateTimeSchema,
  ScopeHashSchema,
  SemVerSchema,
} from "./common.js";
import { isSupportedContractSchemaVersion } from "./version.js";

describe("domain IDs", () => {
  it("accepts UUIDs and rejects non-UUIDs per brand", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(ScanIdSchema.parse(id)).toBe(id);
    expect(() => ScanIdSchema.parse("scan-1")).toThrow();
    expect(() => WorkspaceIdSchema.parse("")).toThrow();
  });
});

describe("shared scalars", () => {
  it("accepts UTC ISO datetimes, scope hashes, semver", () => {
    expect(IsoUtcDateTimeSchema.parse("2026-11-06T15:00:00Z")).toBe(
      "2026-11-06T15:00:00Z",
    );
    expect(() => IsoUtcDateTimeSchema.parse("tomorrow")).toThrow();
    expect(ScopeHashSchema.parse("a".repeat(64))).toBe("a".repeat(64));
    expect(() => ScopeHashSchema.parse("abc")).toThrow();
    expect(SemVerSchema.parse("1.0.0")).toBe("1.0.0");
    expect(() => SemVerSchema.parse("v1")).toThrow();
  });

  it("gates supported schema versions", () => {
    expect(isSupportedContractSchemaVersion(1)).toBe(true);
    expect(isSupportedContractSchemaVersion(2)).toBe(false);
    expect(isSupportedContractSchemaVersion("1")).toBe(false);
  });
});
