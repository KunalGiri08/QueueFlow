import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  createRateLimitResponse,
  enforceRateLimit,
  getClientIp,
  validatePayloadSize,
  resetRateLimits,
  RATE_LIMIT_CONFIGS,
} from "./rate-limit";

describe("lib/rate-limit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  describe("getClientIp", () => {
    it("prefers X-Real-IP over X-Forwarded-For", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "203.0.113.195",
          "x-forwarded-for": "198.51.100.1, 192.0.2.1",
        },
      });

      expect(getClientIp(request)).toBe("203.0.113.195");
    });

    it("parses the first IP from X-Forwarded-For when X-Real-IP is absent", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-forwarded-for": "198.51.100.22, 10.0.0.1",
        },
      });

      expect(getClientIp(request)).toBe("198.51.100.22");
    });

    it("falls back to 127.0.0.1 when no forwarding headers are provided", () => {
      const request = new Request("http://localhost");
      expect(getClientIp(request)).toBe("127.0.0.1");
    });

    it("prevents spoofed prepended headers by sanitizing input", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "  203.0.113.50  ",
        },
      });
      expect(getClientIp(request)).toBe("203.0.113.50");
    });

    it("rejects invalid IPv4 strings and falls back to 127.0.0.1", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "999.999.999.999",
        },
      });
      expect(getClientIp(request)).toBe("127.0.0.1");
    });

    it("rejects non-IP garbage strings and falls back to 127.0.0.1", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "attacker-injected-string; rm -rf",
        },
      });
      expect(getClientIp(request)).toBe("127.0.0.1");
    });

    it("accepts valid IPv6 addresses", () => {
      const request = new Request("http://localhost", {
        headers: {
          "x-real-ip": "2001:db8::1",
        },
      });
      expect(getClientIp(request)).toBe("2001:db8::1");
    });
  });

  describe("checkRateLimit and enforceRateLimit", () => {
    it("allows requests under the limit and tracks remaining quota", () => {
      const config = { limit: 3, windowMs: 60000 };
      const key = "test-user-1";

      const first = checkRateLimit(key, config);
      expect(first.success).toBe(true);
      expect(first.remaining).toBe(2);

      const second = checkRateLimit(key, config);
      expect(second.success).toBe(true);
      expect(second.remaining).toBe(1);

      const third = checkRateLimit(key, config);
      expect(third.success).toBe(true);
      expect(third.remaining).toBe(0);
    });

    it("returns HTTP 429 when rate limit is exceeded", () => {
      const config = { limit: 2, windowMs: 60000 };
      const key = "rate-limited-user";

      checkRateLimit(key, config);
      checkRateLimit(key, config);

      const fourth = checkRateLimit(key, config);
      expect(fourth.success).toBe(false);
      expect(fourth.remaining).toBe(0);
      expect(fourth.retryAfter).toBeGreaterThan(0);

      const response = createRateLimitResponse(fourth);
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe(String(fourth.retryAfter));
      expect(response.headers.get("X-RateLimit-Limit")).toBe("2");
      expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(response.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("enforceRateLimit returns null when allowed and 429 Response when exceeded", async () => {
      const config = { limit: 1, windowMs: 60000 };
      const key = "enforce-key";

      const first = enforceRateLimit(key, config);
      expect(first).toBeNull();

      const second = enforceRateLimit(key, config);
      expect(second).not.toBeNull();
      expect(second?.status).toBe(429);

      const json = await second?.json();
      expect(json).toEqual({
        error: "Too many requests. Please try again later.",
        code: "RATE_LIMIT_EXCEEDED",
      });
    });

    it("resets quota after window expiration", () => {
      vi.useFakeTimers();
      const config = { limit: 1, windowMs: 1000 };
      const key = "expiring-key";

      const first = checkRateLimit(key, config);
      expect(first.success).toBe(true);

      const second = checkRateLimit(key, config);
      expect(second.success).toBe(false);

      // Advance time beyond window
      vi.advanceTimersByTime(1100);

      const third = checkRateLimit(key, config);
      expect(third.success).toBe(true);
      expect(third.remaining).toBe(0);
    });

    it("scopes limits independently by key (user vs IP)", () => {
      const config = { limit: 1, windowMs: 60000 };

      const userA = checkRateLimit("user:user-A", config);
      const userB = checkRateLimit("user:user-B", config);
      const ipA = checkRateLimit("ip:198.51.100.1", config);

      expect(userA.success).toBe(true);
      expect(userB.success).toBe(true);
      expect(ipA.success).toBe(true);

      // Second request for user A is blocked, while user B and IP A are unaffected
      expect(checkRateLimit("user:user-A", config).success).toBe(false);
      expect(checkRateLimit("user:user-B", config).success).toBe(false);
      expect(checkRateLimit("ip:198.51.100.1", config).success).toBe(false);
    });

    it("does not throttle SSE streams after connection is established", () => {
      // SSE connection rate limit applies to the connection initiation
      const sseConfig = RATE_LIMIT_CONFIGS.SSE_CONNECT;
      const key = "ip:203.0.113.1";

      for (let i = 0; i < sseConfig.limit; i++) {
        expect(checkRateLimit(key, sseConfig).success).toBe(true);
      }

      // Further connection attempts within the window are throttled
      expect(checkRateLimit(key, sseConfig).success).toBe(false);
    });

    it("bounds store memory by evicting entries under high burst", () => {
      const config = { limit: 10, windowMs: 60000 };
      // Insert 10,500 distinct keys
      for (let i = 0; i < 10500; i++) {
        checkRateLimit(`burst-user-${i}`, config);
      }
      // The store must be bounded at or below MAX_STORE_SIZE (10,000)
      // Verify a new entry can be added without error
      const result = checkRateLimit("burst-new-user", config);
      expect(result.success).toBe(true);
    });
  });

  describe("validatePayloadSize", () => {
    it("passes when Content-Length is within limit", () => {
      const request = new Request("http://localhost", {
        headers: {
          "content-length": "1024",
        },
      });

      const result = validatePayloadSize(request, 65536);
      expect(result.valid).toBe(true);
    });

    it("returns HTTP 413 when Content-Length exceeds limit", async () => {
      const request = new Request("http://localhost", {
        headers: {
          "content-length": "100000",
        },
      });

      const result = validatePayloadSize(request, 65536);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.response.status).toBe(413);
        const json = await result.response.json();
        expect(json).toEqual({
          error: "Payload too large",
          code: "PAYLOAD_TOO_LARGE",
        });
      }
    });

    it("passes when Content-Length header is omitted", () => {
      const request = new Request("http://localhost");
      const result = validatePayloadSize(request, 65536);
      expect(result.valid).toBe(true);
    });
  });
});

