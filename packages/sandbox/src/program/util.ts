/**
 * Small dependency-free helpers for the runner program. Keep this file free of
 * imports beyond node builtins and type-only contract imports: the program is
 * copied into the runner image with no node_modules.
 */

import { createHash } from "node:crypto";

import type { RunnerLine } from "./protocol.ts";

/** Emit one bounded NDJSON protocol line on stdout. */
export function emit(line: RunnerLine): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Truncate a string for bounded evidence fields. */
export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}

const SECRETISH_PATTERNS: readonly RegExp[] = [
  /lab-token-[a-z0-9-]+/gi,
  /lab-session-[a-z0-9-]+/gi,
  /Bearer\s+\S+/gi,
];

/**
 * Redact anything that could resemble a credential from text surfaced in
 * evidence. Lab fixture tokens are synthetic but the habit is load-bearing.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRETISH_PATTERNS) {
    out = out.replace(pattern, "[redacted]");
  }
  return out;
}

/** Read all of stdin as UTF-8 text (the controller writes one JSON doc). */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
