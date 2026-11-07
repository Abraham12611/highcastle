/**
 * Pattern A program contract — the controller-side authorization of
 * MODEL-AUTHORED source (issue #54).
 *
 * Flow: Vultr Serverless Inference → `ProgramDraft` (source + provenance)
 * → `authorizeModelProgram` (strict schema + static source gate + sha pin)
 * → `AuthorizedModelProgram` → `ExecuteContext.program` → envelope → the
 * guest executor inside the ephemeral runner. The trusted host never
 * evaluates the source.
 *
 * This is deliberately NOT a shared-contract type: `SandboxRequest` stays
 * frozen (packId `bola-invoice-v1` still names the authorized test — the
 * model authors the implementation). Coordinated with L01 via the
 * `ExecuteContext` extension, not a contract bump.
 */

import { z } from "zod";

import {
  MAX_PROGRAM_SOURCE_BYTES,
  PROGRAM_LANGUAGE,
  validateProgramSource,
} from "./program/guest.ts";
import { sha256Hex } from "./program/util.ts";

export const ModelProgramGeneratorSchema = z
  .object({
    provider: z.literal("vultr-inference"),
    /** Provider-reported model id (never assumed from config). */
    model: z.string().min(1).max(128),
    /** Provider or client generation timestamp (ISO). */
    generatedAt: z.string().min(1).max(64),
  })
  .strict();
export type ModelProgramGenerator = z.infer<typeof ModelProgramGeneratorSchema>;

/** Raw model output before authorization. */
export const ProgramDraftSchema = z
  .object({
    source: z.string().min(1).max(MAX_PROGRAM_SOURCE_BYTES),
    generator: ModelProgramGeneratorSchema,
  })
  .strict();
export type ProgramDraft = z.infer<typeof ProgramDraftSchema>;

/** The authorized, sha-pinned program the controller may dispatch. */
export const AuthorizedModelProgramSchema = z
  .object({
    language: z.literal(PROGRAM_LANGUAGE),
    source: z.string().min(1).max(MAX_PROGRAM_SOURCE_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    generator: ModelProgramGeneratorSchema,
  })
  .strict();
export type AuthorizedModelProgram = z.infer<typeof AuthorizedModelProgramSchema>;

/**
 * Turn an untrusted draft into an authorized program — or reject it.
 * Static source checks run here AND again inside the runner image (a
 * tampered envelope is refused twice).
 */
export function authorizeModelProgram(draft: unknown): AuthorizedModelProgram {
  const parsed = ProgramDraftSchema.safeParse(draft);
  if (!parsed.success) {
    throw new Error(`program draft failed schema: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  const check = validateProgramSource(parsed.data.source);
  if (!check.ok) {
    throw new Error(`program source rejected: ${check.reason ?? "invalid"}`);
  }
  return AuthorizedModelProgramSchema.parse({
    language: PROGRAM_LANGUAGE,
    source: parsed.data.source,
    sha256: sha256Hex(parsed.data.source),
    generator: parsed.data.generator,
  });
}

// --- Vultr Serverless Inference generation ---

/** Port the orchestrator (or CLI) uses to obtain a model-authored program. */
export interface ModelProgramGeneratorPort {
  generate(input: ProgramGenerationInput): Promise<ProgramDraft>;
}

export interface ProgramGenerationInput {
  /** What the program must accomplish (scope text, no secrets). */
  objective: string;
  /** Allowed paths the guest may request. */
  allowedPaths: string[];
  /** Request budget the guest must respect. */
  maxRequests: number;
}

const PROGRAM_SYSTEM_PROMPT = [
  "You write a small JavaScript async function body for a strictly sandboxed probe.",
  "The body is wrapped as `(async () => { <your code> })()` inside a node:vm context.",
  "Available APIs — NOTHING else exists (no require/process/fetch/net/fs):",
  "  await lab.get(path)  -> { status, body }   // GET to the synthetic lab only",
  "  print(msg)                               // bounded log line",
  "Return a JSON-serializable object summarizing observed facts.",
  "Rules: GET only; use only the listed paths; stay under the request budget;",
  "no URLs, no comments about real systems, keep the program short.",
].join("\n");

/**
 * Thin OpenAI-compatible chat call to Vultr Serverless Inference for program
 * generation. Config resolution is reused from @highcastle/inference (L12);
 * the call itself lives here because that package's client only exposes the
 * hypothesis-specific method — coordinated, not duplicated behavior.
 */
export class VultrProgramGenerator implements ModelProgramGeneratorPort {
  private readonly cfg: { baseUrl: string; apiKey: string; model: string; timeoutMs: number };
  private readonly fetchImpl: typeof fetch;
  constructor(
    cfg: { baseUrl: string; apiKey: string; model: string; timeoutMs: number },
    fetchImpl: typeof fetch = fetch,
  ) {
    this.cfg = cfg;
    this.fetchImpl = fetchImpl;
  }

  async generate(input: ProgramGenerationInput): Promise<ProgramDraft> {
    const user = [
      `Objective: ${input.objective}`,
      `Allowed paths: ${input.allowedPaths.join(", ")}`,
      `Request budget: ${input.maxRequests}`,
      "Respond with ONLY the JavaScript source (no fences, no prose).",
    ].join("\n");

    const res = await this.fetchImpl(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.cfg.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: [
          { role: "system", content: PROGRAM_SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        max_tokens: 1024,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(this.cfg.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`vultr inference HTTP ${res.status}`);
    }
    const envelope = (await res.json()) as {
      choices?: { message?: { content?: unknown } }[];
      model?: unknown;
    };
    const content = envelope.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("vultr inference returned no program content");
    }
    return {
      source: stripCodeFence(content),
      generator: {
        provider: "vultr-inference",
        model: typeof envelope.model === "string" ? envelope.model : this.cfg.model,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}

function stripCodeFence(text: string): string {
  const m = /```(?:javascript|js)?\s*([\s\S]*?)```/i.exec(text);
  return (m?.[1] ?? text).trim();
}

/** Resolve the Vultr call config from env (server-side only). */
export function resolveProgramGeneratorConfig(env: NodeJS.ProcessEnv = process.env): {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
} | null {
  const apiKey = env["VULTR_INFERENCE_API_KEY"];
  const model = env["VULTR_INFERENCE_MODEL"];
  if (apiKey === undefined || apiKey === "" || model === undefined || model === "") {
    return null;
  }
  return {
    baseUrl: (env["VULTR_INFERENCE_BASE_URL"] ?? "https://api.vultrinference.com/v1").replace(
      /\/+$/,
      "",
    ),
    apiKey,
    model,
    timeoutMs: 30_000,
  };
}
