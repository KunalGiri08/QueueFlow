import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";

// Hoist mock for clerkMiddleware so we can capture the handler passed to it
const { mockClerkMiddleware } = vi.hoisted(() => ({
  mockClerkMiddleware: vi.fn((handler) => handler),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: mockClerkMiddleware,
}));

import middleware from "./proxy";

describe("proxy middleware", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.clearAllMocks();
  });

  const createMockRequest = (
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
    } = {},
  ) => {
    const parsedUrl = new URL(url);
    const headers = new Headers(options.headers || {});
    return {
      method: options.method || "GET",
      url,
      nextUrl: parsedUrl,
      headers,
    } as unknown as Request & { nextUrl: URL };
  };

  const mockAuth = (userId: string | null = null) => {
    return () => Promise.resolve({ userId });
  };

  it("returns HTTP 413 when request Content-Length exceeds 64KB on POST", async () => {
    const req = createMockRequest("http://localhost/api/tickets", {
      method: "POST",
      headers: {
        "content-length": "70000",
      },
    });

    const response = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth("user-1"),
      req,
    );

    expect(response).toBeDefined();
    expect(response?.status).toBe(413);
    const json = await response?.json();
    expect(json).toEqual({
      error: "Payload too large",
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("allows normal payload size through middleware", async () => {
    const req = createMockRequest("http://localhost/api/tickets", {
      method: "POST",
      headers: {
        "content-length": "1024",
      },
    });

    const response = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth("user-1"),
      req,
    );

    expect(response).toBeUndefined();
  });

  it("enforces rate limits on public ticket creation", async () => {
    const url = "http://localhost/api/public/organizations/org-1/services/srv-1/queues/q-1/tickets";
    const req = createMockRequest(url, {
      method: "POST",
      headers: {
        "x-real-ip": "198.51.100.5",
      },
    });

    // Make 10 allowed requests (limit is 10 per minute)
    for (let i = 0; i < 10; i++) {
      const res = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
        mockAuth(null),
        req,
      );
      expect(res).toBeUndefined();
    }

    // 11th request must receive HTTP 429
    const blockedRes = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth(null),
      req,
    );

    expect(blockedRes).toBeDefined();
    expect(blockedRes?.status).toBe(429);
    expect(blockedRes?.headers.get("Retry-After")).toBeDefined();
    const json = await blockedRes?.json();
    expect(json.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("enforces rate limits on public tracking endpoints", async () => {
    const url = "http://localhost/api/tickets/track/tok-123";
    const req = createMockRequest(url, {
      method: "GET",
      headers: {
        "x-real-ip": "203.0.113.88",
      },
    });

    for (let i = 0; i < 60; i++) {
      const res = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
        mockAuth(null),
        req,
      );
      expect(res).toBeUndefined();
    }

    const blockedRes = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth(null),
      req,
    );

    expect(blockedRes).toBeDefined();
    expect(blockedRes?.status).toBe(429);
  });

  it("scopes authenticated limits by user ID rather than IP", async () => {
    const url = "http://localhost/api/tickets";
    const reqFromIp1 = createMockRequest(url, {
      method: "POST",
      headers: { "x-real-ip": "1.1.1.1" },
    });
    const reqFromIp2 = createMockRequest(url, {
      method: "POST",
      headers: { "x-real-ip": "2.2.2.2" },
    });

    // User A makes 15 requests across changing IPs (limit is 15)
    for (let i = 0; i < 15; i++) {
      const req = i % 2 === 0 ? reqFromIp1 : reqFromIp2;
      const res = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
        mockAuth("user-A"),
        req,
      );
      expect(res).toBeUndefined();
    }

    // User A is blocked even if they change their IP
    const blockedUserA = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth("user-A"),
      reqFromIp2,
    );
    expect(blockedUserA?.status).toBe(429);

    // User B from same IP is NOT blocked
    const allowedUserB = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth("user-B"),
      reqFromIp2,
    );
    expect(allowedUserB).toBeUndefined();
  });

  it("enforces rate limits on appointment mutations (PATCH /api/appointments/[id])", async () => {
    const url = "http://localhost/api/appointments/appt-123";
    const req = createMockRequest(url, {
      method: "PATCH",
      headers: { "x-real-ip": "198.51.100.99" },
    });

    for (let i = 0; i < 15; i++) {
      const res = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
        mockAuth("user-mutator"),
        req,
      );
      expect(res).toBeUndefined();
    }

    const blockedRes = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth("user-mutator"),
      req,
    );
    expect(blockedRes).toBeDefined();
    expect(blockedRes?.status).toBe(429);
  });

  it("enforces rate limits on public discovery endpoints (GET /api/public/**)", async () => {
    const url = "http://localhost/api/public/organizations";
    const req = createMockRequest(url, {
      method: "GET",
      headers: { "x-real-ip": "203.0.113.77" },
    });

    for (let i = 0; i < 60; i++) {
      const res = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
        mockAuth(null),
        req,
      );
      expect(res).toBeUndefined();
    }

    const blockedRes = await (middleware as unknown as (auth: unknown, req: Request) => Promise<Response | undefined>)(
      mockAuth(null),
      req,
    );
    expect(blockedRes).toBeDefined();
    expect(blockedRes?.status).toBe(429);
  });
});

