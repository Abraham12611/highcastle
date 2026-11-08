/**
 * DockerCliRuntime — drives the Docker daemon via the `docker` CLI.
 *
 * Chosen deliberately over a socket library: zero added dependencies, the CLI
 * is present wherever the daemon is, and every invocation is `execFile`/
 * `spawn` with an argument vector — there is no shell anywhere in this path,
 * so no part of a request can ever be interpreted by one.
 *
 * The controller is the ONLY component that may hold this adapter; the runner
 * container cannot reach the daemon (no socket mount — probed).
 */

import { execFile, spawn } from "node:child_process";

import { SandboxError, SandboxUnavailableError } from "./errors.ts";
import type {
  ContainerInspection,
  ContainerRuntime,
  ManagedContainer,
  NetworkInfo,
  ServiceImageResolution,
  StartedContainer,
} from "./ports.ts";

interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runDocker(args: string[], timeoutMs = 15_000): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      "docker",
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && typeof err.code !== "number") {
          // ENOENT (no docker binary) or timeout kill
          reject(
            new SandboxUnavailableError(`docker ${args[0] ?? ""} unavailable: ${err.message}`),
          );
          return;
        }
        const rawCode = err?.code;
        resolve({
          code: typeof rawCode === "number" ? rawCode : 0,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      },
    );
  });
}

export class DockerCliRuntime implements ContainerRuntime {
  readonly kind = "docker";

  async isAvailable(): Promise<boolean> {
    try {
      const res = await runDocker(["version", "--format", "{{.Server.Version}}"], 10_000);
      return res.code === 0 && res.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  async networkInfo(name: string): Promise<NetworkInfo> {
    const res = await runDocker(["network", "inspect", name, "--format", "{{json .Internal}}"]);
    if (res.code !== 0) return { exists: false, internal: false };
    return { exists: true, internal: res.stdout.trim() === "true" };
  }

  async createContainer(createArgs: string[]): Promise<string> {
    const res = await runDocker(createArgs);
    if (res.code !== 0) {
      throw new SandboxError(
        "container_create_failed",
        `docker create failed (${res.code}): ${res.stderr.trim()}`,
      );
    }
    const id = res.stdout.trim();
    if (!/^[0-9a-f]{12,64}$/.test(id)) {
      throw new SandboxError(
        "container_create_failed",
        `docker create returned unexpected id ${JSON.stringify(id)}`,
      );
    }
    return id;
  }

  startContainer(containerId: string, stdinPayload: string): Promise<StartedContainer> {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", ["start", "-a", "-i", containerId], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const out: Buffer[] = [];
      const errBuf: Buffer[] = [];
      let settled = false;

      child.stdout.on("data", (d: Buffer) => out.push(d));
      child.stderr.on("data", (d: Buffer) => errBuf.push(d));

      const exited = new Promise<void>((res) => {
        child.on("close", () => res());
      });

      child.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(new SandboxUnavailableError(`docker start failed to spawn: ${err.message}`));
        }
      });

      // Feed the envelope then close stdin — the program reads until EOF.
      child.stdin.on("error", () => {
        // Container may have exited before reading; harmless.
      });
      child.stdin.write(stdinPayload);
      child.stdin.end();

      // `docker start -a` exits quickly with a nonzero code if the container
      // cannot start; otherwise it stays attached until the container exits.
      // Resolve the handle on first stdout data OR after a short settle.
      const settleTimer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve({
            exited,
            stdout: () => Buffer.concat(out).toString("utf8"),
            stderr: () => Buffer.concat(errBuf).toString("utf8"),
          });
        }
      }, 2_000);
      settled = false;
      child.on("close", (code) => {
        clearTimeout(settleTimer);
        if (!settled) {
          settled = true;
          // Process already gone: fast-fail start (e.g. bad image/flags).
          if (code !== 0) {
            reject(
              new SandboxError(
                "container_start_failed",
                `docker start exited ${String(code)}: ${Buffer.concat(errBuf).toString("utf8").trim()}`,
              ),
            );
            return;
          }
          // Container exited before we attached meaningfully — still a valid
          // handle; caller inspects the container for the real exit code.
          resolve({
            exited: Promise.resolve(),
            stdout: () => Buffer.concat(out).toString("utf8"),
            stderr: () => Buffer.concat(errBuf).toString("utf8"),
          });
        }
      });
    });
  }

  async killContainer(containerId: string): Promise<void> {
    const res = await runDocker(["kill", "--signal", "SIGKILL", containerId], 10_000);
    if (res.code !== 0 && !/No such container|is not running/i.test(res.stderr)) {
      throw new SandboxError("container_kill_failed", `docker kill failed: ${res.stderr.trim()}`);
    }
  }

  async removeContainer(containerId: string): Promise<void> {
    const res = await runDocker(["rm", "-f", "-v", containerId], 15_000);
    if (res.code !== 0 && !/No such container/i.test(res.stderr)) {
      throw new SandboxError("container_remove_failed", `docker rm failed: ${res.stderr.trim()}`);
    }
  }

  async inspectContainer(containerId: string): Promise<ContainerInspection> {
    const res = await runDocker([
      "inspect",
      "--format",
      "{{.State.Running}} {{.State.ExitCode}}",
      containerId,
    ]);
    if (res.code !== 0) return { exists: false, running: false, exitCode: null };
    const [runningStr, exitStr] = res.stdout.trim().split(/\s+/);
    const exitCode = Number(exitStr);
    return {
      exists: true,
      running: runningStr === "true",
      exitCode: Number.isFinite(exitCode) ? exitCode : null,
    };
  }

  async resolveServiceImage(network: string, alias: string): Promise<ServiceImageResolution> {
    const ids = await runDocker(["ps", "-aq", "--filter", `network=${network}`]);
    if (ids.code !== 0) {
      throw new SandboxUnavailableError(`docker ps failed: ${ids.stderr.trim()}`);
    }
    let matchCount = 0;
    let imageId: string | null = null;
    let repoDigests: string[] = [];
    for (const id of ids.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "")) {
      const nets = await runDocker([
        "inspect",
        "--format",
        "{{json .NetworkSettings.Networks}}",
        id,
      ]);
      if (nets.code !== 0) continue;
      let claimsAlias = false;
      try {
        const parsed = JSON.parse(nets.stdout) as Record<string, { Aliases?: string[] }>;
        claimsAlias = (parsed[network]?.Aliases ?? []).includes(alias);
      } catch {
        continue;
      }
      if (!claimsAlias) continue;
      matchCount += 1;
      const img = await runDocker(["inspect", "--format", "{{.Image}}", id]);
      imageId = img.code === 0 ? img.stdout.trim() : null;
      const rd = await runDocker(["inspect", "--format", "{{json .RepoDigests}}", imageId ?? id]);
      if (rd.code === 0) {
        try {
          repoDigests = JSON.parse(rd.stdout) as string[];
        } catch {
          repoDigests = [];
        }
      }
    }
    return { matchCount, imageId, repoDigests };
  }

  async listManagedContainers(labelKey: string, labelValue: string): Promise<ManagedContainer[]> {
    const res = await runDocker([
      "ps",
      "-a",
      "--filter",
      `label=${labelKey}=${labelValue}`,
      "--format",
      "{{json .}}",
    ]);
    if (res.code !== 0) {
      throw new SandboxUnavailableError(`docker ps failed: ${res.stderr.trim()}`);
    }
    const containers: ManagedContainer[] = [];
    for (const line of res.stdout.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "") continue;
      const row = JSON.parse(trimmed) as {
        ID?: string;
        Names?: string;
        Labels?: string;
        State?: string;
      };
      if (!row.ID) continue;
      const labels: Record<string, string> = {};
      for (const pair of (row.Labels ?? "").split(",")) {
        const eq = pair.indexOf("=");
        if (eq > 0) labels[pair.slice(0, eq)] = pair.slice(eq + 1);
      }
      containers.push({
        containerId: row.ID,
        name: row.Names ?? "",
        labels,
        running: row.State === "running",
      });
    }
    return containers;
  }
}
