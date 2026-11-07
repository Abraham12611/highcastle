import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pg must load through Node require at runtime — turbopack's hashed async
  // external emit ("pg-<hash>") cannot resolve under pnpm's deployed layout
  // (issue #58). Declaring it keeps the specifier plain "pg".
  serverExternalPackages: ["pg"],
};

export default nextConfig;
