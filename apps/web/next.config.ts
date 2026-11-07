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
};

export default nextConfig;
