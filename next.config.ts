import type { NextConfig } from "next";
import { validateEnv } from "./lib/env";

// Validate environment variables at build and startup time.
const envResult = validateEnv();
if (!envResult.success) {
  throw envResult.error;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://*.clerk.accounts.dev; connect-src 'self' https://*.clerk.accounts.dev https://clerk-telemetry.com https://*.protect.clerk.com:*; img-src 'self' data: blob: https://img.clerk.com https://images.clerk.dev; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
