import { defineConfig } from "vitest/config";

export default defineConfig({
  // Next.js keeps tsconfig `jsx: preserve`; tests transform JSX through Vite
  // 8's oxc option without touching the foundation-owned tsconfig.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
