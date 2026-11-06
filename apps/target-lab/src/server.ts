/**
 * Target-lab entrypoint.
 *
 * The revision is an EXPLICIT, REQUIRED choice — `--revision=<id>` or
 * `TARGET_LAB_REVISION=<id>` — with no default. A missing/unknown value exits
 * non-zero so the vulnerable build can never be started implicitly.
 *
 * Usage:
 *   node src/server.ts --revision=lab-v1-vulnerable [--port=3000] [--host=127.0.0.1]
 *   TARGET_LAB_REVISION=lab-v2-patched PORT=3000 HOST=0.0.0.0 node src/server.ts
 */

import { createServer } from "node:http";
import { createRequestListener } from "./app.ts";
import { isLabRevision, LAB_REVISIONS, type LabRevision } from "./types.ts";
import { FIXTURE_VERSION } from "./fixtures.ts";

interface Cli {
  revision?: string | undefined;
  port?: string | undefined;
  host?: string | undefined;
  help?: boolean;
}

function parseCli(argv: string[]): Cli {
  const cli: Cli = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(2);
    }
    const eq = arg.indexOf("=", 2);
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? undefined : arg.slice(eq + 1);
    if (key === "revision" || key === "port" || key === "host") cli[key] = value;
    else if (key === "help" || key === "h") cli.help = true;
    else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return cli;
}

function usage(): string {
  return [
    "highcastle-target-lab — synthetic invoice SaaS test target",
    "",
    "  node src/server.ts --revision=<REVISION> [--port=PORT] [--host=HOST]",
    "",
    `  REVISION (required): ${LAB_REVISIONS.join(" | ")}`,
    "  PORT: listening port (env PORT, default 3000)",
    "  HOST: bind address (env HOST, default 127.0.0.1)",
    "  TARGET_LAB_REVISION env var is an accepted alternative to --revision",
  ].join("\n");
}

const cli = parseCli(process.argv.slice(2));
if (cli.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

const revisionInput = cli.revision ?? process.env.TARGET_LAB_REVISION;
if (!isLabRevision(revisionInput)) {
  process.stderr.write(
    `ERROR: a lab revision is required and must be one of: ${LAB_REVISIONS.join(", ")}.\n` +
      `Got: ${revisionInput ?? "(unset)"}.\n\n${usage()}\n`,
  );
  process.exit(1);
}
const revision: LabRevision = revisionInput;

const port = Number(cli.port ?? process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  process.stderr.write(`ERROR: invalid port: ${cli.port ?? process.env.PORT}\n`);
  process.exit(1);
}
const host = cli.host ?? process.env.HOST ?? "127.0.0.1";

const server = createServer(createRequestListener({ revision, ...(process.env.SOURCE_GIT_SHA ? { sourceSha: process.env.SOURCE_GIT_SHA } : {}) }));

server.listen(port, host, () => {
  const address = server.address();
  const bound = typeof address === "object" && address ? `${address.address}:${address.port}` : `${host}:${port}`;
  process.stdout.write(
    `${JSON.stringify({
      ts: new Date().toISOString(),
      event: "target_lab_started",
      revision,
      fixtureVersion: FIXTURE_VERSION,
      listening: `http://${bound}`,
    })}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
