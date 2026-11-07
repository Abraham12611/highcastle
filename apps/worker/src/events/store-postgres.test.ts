import { PGlite } from "@electric-sql/pglite";
import {
  ScanIdSchema,
  WorkspaceIdSchema,
} from "@highcastle/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PgPool } from "./store-postgres.js";
import { PostgresEventStore } from "./store-postgres.js";

/**
 * End-to-end persistence against genuine PostgreSQL semantics (PGlite embeds
 * the real engine in-process — no network, no service, CI-safe).
 *
 * TEMPORARY SEAM: the DDL below mirrors `docs/architecture/03_DATABASE_SCHEMA.md`
 * for this test only. When L02 PR #18 merges, these tests switch to
 * `@highcastle/db`'s migrations + `appendScanEvent`/`listScanEvents` and the
 * local DDL is deleted.
 */

const SCAN_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const FOREIGN_WORKSPACE_ID = "33333333-3333-4333-8333-333333333333";

const DDL = `
CREATE TABLE scans (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL
);
CREATE TABLE scan_events (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  scan_id UUID NOT NULL REFERENCES scans(id),
  seq BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  phase TEXT,
  actor_type TEXT NOT NULL,
  safe_summary TEXT NOT NULL,
  payload_redacted JSONB NOT NULL DEFAULT '{}',
  attempt_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scan_id, seq)
);`;

describe("PostgresEventStore (PGlite)", () => {
  let db: PGlite;
  let store: PostgresEventStore;

  beforeEach(async () => {
    db = new PGlite();
    await db.exec(DDL);
    await db.query("INSERT INTO scans (id, workspace_id) VALUES ($1, $2)", [
      SCAN_ID,
      WORKSPACE_ID,
    ]);
    store = new PostgresEventStore(db as unknown as PgPool);
  });

  afterEach(async () => {
    await db.close();
  });

  it("persists and reloads events with ISO timestamps", async () => {
    const event = await store.append({
      workspaceId: WorkspaceIdSchema.parse(WORKSPACE_ID),
      scanId: ScanIdSchema.parse(SCAN_ID),
      eventType: "scan.started",
      phase: "preparing",
      actorType: "worker",
      safeSummary: "Preparing authorized lab assessment",
      payloadRedacted: { fixture: "invoice_A" },
    });
    expect(event.seq).toBe(1);
    expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const listed = await store.list(
      ScanIdSchema.parse(SCAN_ID),
      WorkspaceIdSchema.parse(WORKSPACE_ID),
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.payloadRedacted).toEqual({ fixture: "invoice_A" });
    expect(listed[0]?.seq).toBe(1);
  });

  it("keeps gapless sequences under concurrent writers", async () => {
    const scanId = ScanIdSchema.parse(SCAN_ID);
    const workspaceId = WorkspaceIdSchema.parse(WORKSPACE_ID);
    const events = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.append({
          workspaceId,
          scanId,
          eventType: "scan.stage.updated",
          actorType: "worker",
          safeSummary: `step ${i}`,
        }),
      ),
    );
    const seqs = events.map((event) => event.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("denies unknown scans and foreign workspaces identically", async () => {
    const scanId = ScanIdSchema.parse(SCAN_ID);
    const workspaceId = WorkspaceIdSchema.parse(WORKSPACE_ID);
    const foreign = WorkspaceIdSchema.parse(FOREIGN_WORKSPACE_ID);
    const missing = ScanIdSchema.parse(
      "99999999-9999-4999-8999-999999999999",
    );
    await expect(
      store.append({
        workspaceId: foreign,
        scanId,
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "intruder",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(store.list(scanId, foreign)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(store.list(missing, workspaceId)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("retries string and numeric unique-violation codes from either driver", async () => {
    // Scripted pool: first INSERT collides (cross-process race), then the
    // re-read MAX returns 1 and the retry succeeds.
    for (const code of ["23505", 23505]) {
      let inserts = 0;
      const pool: PgPool = {
        async query(text: string) {
          if (text.startsWith("SELECT workspace_id")) {
            return { rows: [{ workspace_id: WORKSPACE_ID }], rowCount: 1 };
          }
          if (text.startsWith("SELECT COALESCE")) {
            return { rows: [{ max_seq: inserts > 0 ? 1 : 0 }], rowCount: 1 };
          }
          inserts += 1;
          if (inserts === 1) {
            throw Object.assign(new Error("duplicate key value"), { code });
          }
          return {
            rows: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                workspace_id: WORKSPACE_ID,
                scan_id: SCAN_ID,
                seq: 2,
                event_type: "scan.started",
                phase: null,
                actor_type: "worker",
                safe_summary: "x",
                payload_redacted: {},
                attempt_id: null,
                occurred_at: new Date("2026-11-06T15:00:00Z"),
              },
            ],
            rowCount: 1,
          };
        },
      };
      const event = await new PostgresEventStore(pool).append({
        workspaceId: WorkspaceIdSchema.parse(WORKSPACE_ID),
        scanId: ScanIdSchema.parse(SCAN_ID),
        eventType: "scan.started",
        actorType: "worker",
        safeSummary: "x",
      });
      expect(event.seq).toBe(2);
    }
  });

  it("recovers history after restart (new pool, same database)", async () => {
    const scanId = ScanIdSchema.parse(SCAN_ID);
    const workspaceId = WorkspaceIdSchema.parse(WORKSPACE_ID);
    await store.append({
      workspaceId,
      scanId,
      eventType: "scan.started",
      actorType: "worker",
      safeSummary: "one",
    });
    const reopened = new PostgresEventStore(db as unknown as PgPool);
    const listed = await reopened.list(scanId, workspaceId);
    expect(listed.map((event) => event.seq)).toEqual([1]);
    const second = await reopened.append({
      workspaceId,
      scanId,
      eventType: "scan.completed",
      actorType: "worker",
      safeSummary: "two",
    });
    expect(second.seq).toBe(2);
  });
});
