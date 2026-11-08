import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * Self-contained production output — required for the deploy image.
   * Turbopack emits hashed externals (e.g. `pg-<hash>`) when a package
   * resolves through a workspace dep's nested pnpm path; those specifiers
   * only resolve inside Next's traced standalone tree, never in a plain
   * `pnpm deploy` node_modules bundle. Standalone emits server.js +
   * a correctly traced node_modules at the workspace root.
   */
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  turbopack: {
    resolveAlias: {
      /*
       * @composio/core imports zod/v3 + zod/v4 (subpaths added in zod
       * 3.25). The workspace pins zod 3.23.8 for contract parity — the
       * SDK gets its own zod-compat instance via these aliases instead
       * of a global upgrade.
       */
      "zod/v3": "zod-compat/v3",
      "zod/v4": "zod-compat/v4",
    },
  },
  webpack: (config) => {
    config.resolve.alias["zod/v3"] = "zod-compat/v3";
    config.resolve.alias["zod/v4"] = "zod-compat/v4";
    return config;
  },
};

export default nextConfig;
