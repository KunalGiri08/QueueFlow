/**
 * Process-Local In-Memory Rate Limiter and Request Validation
 *
 * Architecture Note:
 * QueueFlow currently uses a single-instance container deployment behind an Nginx reverse proxy.
 * This in-memory limiter provides effective, low-overhead process-local throttling and DoS
 * mitigation for this deployment model.
 *
 * Multi-Instance Limitation:
 * In a horizontally scaled multi-instance deployment, rate limiting state is not shared across
 * processes. To achieve global rate-limit enforcement across multiple replicas, a centralized
 * datastore (e.g., Redis via Upstash or AWS ElastiCache) would be required.
 */

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

let lastCleanup = Date.now();
const CLEANUP_INTERVAL_MS = 60000;
const MAX_STORE_SIZE = 10000;

function cleanupExpired(now: number): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && store.size < 5000) {
    return;
  }
  lastCleanup = now;
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }

  // Enforce a hard memory upper bound by evicting oldest entries if burst exceeds MAX_STORE_SIZE
  if (store.size > MAX_STORE_SIZE) {
    const excess = store.size - MAX_STORE_SIZE;
    let evicted = 0;
    for (const key of store.keys()) {
      store.delete(key);
      evicted++;
      if (evicted >= excess) break;
    }
  }
}

/**
 * Validates that an IP string conforms to standard IPv4 or IPv6 format.
 */
export function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  // IPv4 validation: 4 decimal octets between 0 and 255
  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    return ipv4Match.slice(1, 5).every((octet) => {
      const num = Number(octet);
      return num >= 0 && num <= 255;
    });
  }
  // IPv6 validation: hex and colons only, at least two colons or ::
  if (ip.includes(":") && /^[0-9a-fA-F:]+$/.test(ip)) {
    return true;
  }
  return false;
}

/**
 * Extracts a trustworthy client IP address behind an Nginx reverse proxy.
 * 
 * Security Consideration:
 * - Direct internet clients cannot spoof X-Real-IP because Nginx overwrites it with $remote_addr.
 * - If X-Real-IP is present and is a valid IP, it takes precedence.
 * - If X-Forwarded-For is evaluated, we take the initial client IP and validate it.
 * - Malformed or invalid IP strings fall back safely to "127.0.0.1".
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  return "127.0.0.1";
}

/**
 * Checks and increments the rate limit counter for a given key.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now();
  cleanupExpired(now);

  const existing = store.get(key);

  if (!existing || now >= existing.resetAt) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - 1,
      resetAt,
      retryAfter: Math.ceil(config.windowMs / 1000),
    };
  }

  if (existing.count < config.limit) {
    existing.count += 1;
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - existing.count,
      resetAt: existing.resetAt,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    success: false,
    limit: config.limit,
    remaining: 0,
    resetAt: existing.resetAt,
    retryAfter,
  };
}

/**
 * Formats a standard HTTP 429 Too Many Requests response with RFC-compliant headers.
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

/**
 * Evaluates the rate limit for a key and returns a 429 Response if exceeded, or null if allowed.
 */
export function enforceRateLimit(
  key: string,
  config: RateLimitConfig,
): Response | null {
  const result = checkRateLimit(key, config);
  if (!result.success) {
    return createRateLimitResponse(result);
  }
  return null;
}

/**
 * Resets the in-memory rate limiter store. Used in test suites.
 */
export function resetRateLimits(): void {
  store.clear();
}

/**
 * Default maximum allowed body size for JSON API requests (64 KB).
 */
export const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/**
 * Validates request payload size against Content-Length header to prevent large body attacks.
 * Returns HTTP 413 Payload Too Large if limit is exceeded.
 */
export function validatePayloadSize(
  request: Request,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): { valid: true } | { valid: false; response: Response } {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const parsedLength = parseInt(contentLength, 10);
    if (!isNaN(parsedLength) && parsedLength > maxBytes) {
      return {
        valid: false,
        response: Response.json(
          {
            error: "Payload too large",
            code: "PAYLOAD_TOO_LARGE",
          },
          { status: 413 },
        ),
      };
    }
  }
  return { valid: true };
}

/**
 * Configured rate-limit profiles for different sensitivity tiers.
 */
export const RATE_LIMIT_CONFIGS = {
  // Public ticket creation: 10 requests per minute per IP
  PUBLIC_TICKET_CREATE: { limit: 10, windowMs: 60000 },
  // Authenticated ticket creation: 15 requests per minute per user
  AUTH_TICKET_CREATE: { limit: 15, windowMs: 60000 },
  // Appointment creation: 10 requests per minute per user
  APPOINTMENT_CREATE: { limit: 10, windowMs: 60000 },
  // Appointment mutations: 15 requests per minute per user
  APPOINTMENT_MUTATE: { limit: 15, windowMs: 60000 },
  // Public tracking lookup: 60 requests per minute per IP
  PUBLIC_TRACK: { limit: 60, windowMs: 60000 },
  // Public discovery: 60 requests per minute per IP
  PUBLIC_DISCOVERY: { limit: 60, windowMs: 60000 },
  // Real-time SSE connection initialization: 20 attempts per minute per IP
  SSE_CONNECT: { limit: 20, windowMs: 60000 },
} as const;

