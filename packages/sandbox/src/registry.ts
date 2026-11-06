/**
 * RunnerRegistry — lifecycle bookkeeping for runner_instances.
 *
 * In-memory implementation for development/tests. L02 will provide the
 * Drizzle-backed implementation behind the same interface; the controller
 * never cares which it gets.
 */

import type { RunnerInstance, RunnerInstanceId } from "@highcastle/contracts";

import type { RunnerRegistry } from "./ports.ts";
import { SandboxError } from "./errors.ts";

const TERMINAL_STATUSES = new Set(["destroyed", "cleanup_verified", "error", "operator_alert"]);

export class InMemoryRunnerRegistry implements RunnerRegistry {
  private readonly rows = new Map<RunnerInstanceId, RunnerInstance>();

  create(instance: RunnerInstance): Promise<void> {
    if (this.rows.has(instance.id)) {
      return Promise.reject(new SandboxError("registry_conflict", `runner ${instance.id} exists`));
    }
    this.rows.set(instance.id, instance);
    return Promise.resolve();
  }

  update(id: RunnerInstanceId, patch: Partial<RunnerInstance>): Promise<void> {
    const row = this.rows.get(id);
    if (!row) {
      return Promise.reject(new SandboxError("registry_missing", `runner ${id} not found`));
    }
    this.rows.set(id, { ...row, ...patch, id: row.id });
    return Promise.resolve();
  }

  get(id: RunnerInstanceId): Promise<RunnerInstance | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  listActive(): Promise<RunnerInstance[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => !TERMINAL_STATUSES.has(r.status)));
  }

  listAll(): Promise<RunnerInstance[]> {
    return Promise.resolve([...this.rows.values()]);
  }
}
