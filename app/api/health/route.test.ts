import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw, mockEnv } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockEnv: {
    HEALTH_DB_TIMEOUT_MS: 8000,
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("@/lib/env.server", () => ({
  env: mockEnv,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.HEALTH_DB_TIMEOUT_MS = 8000;
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Liveness probe (?probe=live)", () => {
    it("returns HTTP 200 with { status: 'ok' } immediately", async () => {
      const request = new Request("http://localhost:3000/api/health?probe=live");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({ status: "ok" });
    });

    it("does not query Prisma on liveness probe", async () => {
      const request = new Request("http://localhost:3000/api/health?probe=live");
      await GET(request);

      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it("sets Cache-Control: no-store header on liveness response", async () => {
      const request = new Request("http://localhost:3000/api/health?probe=live");
      const response = await GET(request);

      expect(response.headers.get("Cache-Control")).toBe("no-store");
    });
  });

  describe("Readiness probe (default /api/health)", () => {
    it("returns HTTP 200 with { status: 'ok', checks: { database: 'connected' } } when database is reachable", async () => {
      const request = new Request("http://localhost:3000/api/health");
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        status: "ok",
        checks: {
          database: "connected",
        },
      });

      // Verifies direct read-only query is executed without transactions
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it("clears the watchdog timer on successful query completion", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      const request = new Request("http://localhost:3000/api/health");
      await GET(request);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("returns HTTP 503 with { status: 'unavailable', checks: { database: 'disconnected' } } when database query fails", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockQueryRaw.mockRejectedValueOnce(
        new Error(
          "FATAL: password authentication failed for user queueflow at postgres://secret_user:secret_pass@10.0.1.5:5432/queueflow_db",
        ),
      );

      const request = new Request("http://localhost:3000/api/health");
      const response = await GET(request);

      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data).toEqual({
        status: "unavailable",
        checks: {
          database: "disconnected",
        },
      });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("clears the watchdog timer on database query failure", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
      mockQueryRaw.mockRejectedValueOnce(new Error("Query failed"));

      const request = new Request("http://localhost:3000/api/health");
      await GET(request);

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("logs sanitized diagnostics and never exposes credentials or raw error messages in logs or responses", async () => {
      const sensitivePassword = "SUPER_SECRET_DB_PASSWORD_12345";
      const sensitiveHost = "secret-neon-db.internal.aws:5432";
      const sensitiveError = new Error(
        `connect ECONNREFUSED postgres://admin:${sensitivePassword}@${sensitiveHost}/production`,
      );
      sensitiveError.name = "PrismaClientInitializationError";
      sensitiveError.stack = "Error: connect ECONNREFUSED at /app/node_modules/pg/client.js:123";
      mockQueryRaw.mockRejectedValueOnce(sensitiveError);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const request = new Request("http://localhost:3000/api/health");
      const response = await GET(request);
      const responseText = await response.text();

      // 1. HTTP response sanitization
      expect(responseText).not.toContain(sensitivePassword);
      expect(responseText).not.toContain(sensitiveHost);
      expect(responseText).not.toContain("ECONNREFUSED");
      expect(responseText).not.toContain("stack");

      // 2. Safe diagnostic log check: logs stable identifier, elapsed time, and safe category
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const logMessage = consoleErrorSpy.mock.calls[0][0];
      expect(logMessage).toContain("[HealthCheck]");
      expect(logMessage).toContain("category=PrismaClientInitializationError");
      expect(logMessage).toMatch(/\(\d+ms\)/);

      // 3. Log does not contain sensitive details or raw error message
      expect(logMessage).not.toContain(sensitivePassword);
      expect(logMessage).not.toContain(sensitiveHost);
      expect(logMessage).not.toContain("ECONNREFUSED");
      expect(logMessage).not.toContain("postgres://");
    });

    it("returns HTTP 503 and logs PROBE_TIMEOUT when the probe exceeds HEALTH_DB_TIMEOUT_MS", async () => {
      vi.useFakeTimers();
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      // Simulate an unresolved database query
      mockQueryRaw.mockImplementationOnce(() => new Promise(() => {}));

      const request = new Request("http://localhost:3000/api/health");
      const responsePromise = GET(request);

      // Advance timers by the default timeout (8000ms)
      await vi.advanceTimersByTimeAsync(8000);

      const response = await responsePromise;
      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data).toEqual({
        status: "unavailable",
        checks: {
          database: "disconnected",
        },
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("category=PROBE_TIMEOUT"),
      );
    });

    it("respects custom HEALTH_DB_TIMEOUT_MS values", async () => {
      vi.useFakeTimers();
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockEnv.HEALTH_DB_TIMEOUT_MS = 3000;
      mockQueryRaw.mockImplementationOnce(() => new Promise(() => {}));

      const request = new Request("http://localhost:3000/api/health");
      const responsePromise = GET(request);

      // At 2500ms, probe is still pending
      await vi.advanceTimersByTimeAsync(2500);

      // At 3000ms, custom timeout triggers
      await vi.advanceTimersByTimeAsync(500);

      const response = await responsePromise;
      expect(response.status).toBe(503);
    });

    it("sets Cache-Control: no-store header on readiness responses (both 200 and 503)", async () => {
      const okRequest = new Request("http://localhost:3000/api/health");
      const okResponse = await GET(okRequest);
      expect(okResponse.headers.get("Cache-Control")).toBe("no-store");

      vi.spyOn(console, "error").mockImplementation(() => {});
      mockQueryRaw.mockRejectedValueOnce(new Error("DB error"));
      const failRequest = new Request("http://localhost:3000/api/health");
      const failResponse = await GET(failRequest);
      expect(failResponse.headers.get("Cache-Control")).toBe("no-store");
    });
  });
});

