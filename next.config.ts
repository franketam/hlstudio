import type { NextConfig } from "next";

/**
 * Security headers aplicados a todas las rutas.
 *
 * - HSTS: Coolify pone HTTPS. 1 anio + subdominios.
 * - No agregamos CSP en este pase: auditar inline scripts/styles de Next requiere
 *   trabajo dedicado y suele romper hidratacion. Pendiente para Sprint 3.
 * - No usamos camara / microfono / geolocalizacion: Permissions-Policy las niega.
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
  typedRoutes: false,
  turbopack: {},
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
