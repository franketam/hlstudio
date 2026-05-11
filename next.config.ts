import path from "node:path";
import type { NextConfig } from "next";

/**
 * Security headers aplicados a todas las rutas.
 *
 * Notas:
 * - HSTS: Coolify pone HTTPS. 1 año + subdominios.
 * - No agregamos CSP en este pase: auditar inline scripts/styles de Next requiere
 *   trabajo dedicado y suele romper hidratación. Pendiente para Sprint 3.
 * - No usamos cámara / micrófono / geolocalización: Permissions-Policy las niega.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
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
