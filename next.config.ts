import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    typedRoutes: false,
  },
  // Fallback explicito del alias `@/*` -> raiz del proyecto, ademas del
  // que provee tsconfig.json. En algunos entornos (Coolify build) el resolver
  // de webpack no levanta el alias via tsconfig y rompe con `Module not found`.
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@": path.resolve(__dirname),
    };
    return config;
  },
};

export default nextConfig;
