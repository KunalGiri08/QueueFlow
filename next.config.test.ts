import { describe, expect, it, vi } from "vitest";

vi.mock("./lib/env", () => ({
  validateEnv: vi.fn(() => ({ success: true })),
}));

import nextConfig from "./next.config";

describe("next.config.ts HTTP Security Headers", () => {
  it("verifies poweredByHeader is disabled and security headers are configured on /:path*", async () => {
    // 1. poweredByHeader is false
    expect(nextConfig.poweredByHeader).toBe(false);

    // 2. headers() returns a rule matching /:path*
    expect(typeof nextConfig.headers).toBe("function");
    const headerRules = await nextConfig.headers!();
    const globalRule = headerRules.find((rule) => rule.source === "/:path*");

    expect(globalRule).toBeDefined();

    const headersMap = new Map(
      globalRule!.headers.map((h) => [h.key, h.value]),
    );

    // 3. X-Content-Type-Options is nosniff
    expect(headersMap.get("X-Content-Type-Options")).toBe("nosniff");

    // 4. X-Frame-Options is DENY
    expect(headersMap.get("X-Frame-Options")).toBe("DENY");

    // 5. Referrer-Policy is strict-origin-when-cross-origin
    expect(headersMap.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );

    // 6. Permissions-Policy is camera=(), microphone=(), geolocation=()
    expect(headersMap.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );

    // 7. Content-Security-Policy-Report-Only exists and contains the expected core directives
    const cspReportOnly = headersMap.get("Content-Security-Policy-Report-Only");
    expect(cspReportOnly).toBeDefined();
    expect(cspReportOnly).toContain("default-src 'self'");
    expect(cspReportOnly).toContain("object-src 'none'");
    expect(cspReportOnly).toContain("base-uri 'self'");
    expect(cspReportOnly).toContain("form-action 'self'");

    // 8. The same rule does not configure an enforcing Content-Security-Policy header
    expect(headersMap.has("Content-Security-Policy")).toBe(false);
  });
});
