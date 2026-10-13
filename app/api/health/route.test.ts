import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueryRaw, mockTransaction } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = { $queryRaw: mockQueryRaw };
      return callback(tx);
    });
    mockQueryRaw.mockResolvedValue([{ 1: 1 }]);
  });

  afterEach(() => {
    vi.useRealTimers();
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

      expect(mockTransaction).not.toHaveBeenCalled();
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

      expect(mockTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxWait: expect.any(Number),
          timeout: expect.any(Number),
        }),
      );
      expect(mockQueryRaw).toHaveBeenCalled();
    });

    it("uses bounded transaction options (<= 2000ms)", async () => {
      const request = new Request("http://localhost:3000/api/health");
      await GET(request);

      expect(mockTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxWait: 2000,
          timeout: 2000,
        }),
      );
    });

    it("returns HTTP 503 with { status: 'unavailable', checks: { database: 'disconnected' } } when database query fails", async () => {
      mockTransaction.mockRejectedValueOnce(
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
    });

    it("never exposes error messages, stack traces, credentials, or hostnames in failed responses", async () => {
      const sensitiveError = new Error(
        "connect ECONNREFUSED postgres://admin:super_secret_password@db-internal.vpc:5432/production",
      );
      sensitiveError.stack = "Error: connect ECONNREFUSED at /app/node_modules/pg/client.js:123";
      mockTransaction.mockRejectedValueOnce(sensitiveError);

      const request = new Request("http://localhost:3000/api/health");
      const response = await GET(request);
      const text = await response.text();

      expect(text).not.toContain("ECONNREFUSED");
      expect(text).not.toContain("super_secret_password");
      expect(text).not.toContain("db-internal.vpc");
      expect(text).not.toContain("stack");
      expect(text).not.toContain("/app/node_modules");
      expect(text).not.toContain("admin");
    });

    it("returns HTTP 503 when the probe times out", async () => {
      vi.useFakeTimers();
      // Simulate an unresolved promise that never returns
      mockTransaction.mockImplementationOnce(() => new Promise(() => {}));

      const request = new Request("http://localhost:3000/api/health");
      const responsePromise = GET(request);

      await vi.advanceTimersByTimeAsync(3000);

      const response = await responsePromise;
      expect(response.status).toBe(503);
      const data = await response.json();
      expect(data).toEqual({
        status: "unavailable",
        checks: {
          database: "disconnected",
        },
      });
    });

    it("sets Cache-Control: no-store header on readiness responses (both 200 and 503)", async () => {
      const okRequest = new Request("http://localhost:3000/api/health");
      const okResponse = await GET(okRequest);
      expect(okResponse.headers.get("Cache-Control")).toBe("no-store");

      mockTransaction.mockRejectedValueOnce(new Error("DB error"));
      const failRequest = new Request("http://localhost:3000/api/health");
      const failResponse = await GET(failRequest);
      expect(failResponse.headers.get("Cache-Control")).toBe("no-store");
    });
  });
});
