import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  getClientIp,
  validatePayloadSize,
  enforceRateLimit,
  RATE_LIMIT_CONFIGS,
} from "@/lib/rate-limit";

export default clerkMiddleware(async (auth, req) => {
  // 1. Request body size check on mutations
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    const sizeCheck = validatePayloadSize(req);
    if (!sizeCheck.valid) {
      return sizeCheck.response;
    }
  }

  // 2. Targeted rate limiting on abuse-sensitive API routes
  const pathname = req.nextUrl.pathname;

  if (pathname.startsWith("/api/")) {
    const { userId } = await auth();
    const clientIp = getClientIp(req);
    const actorKey = userId ? `user:${userId}` : `ip:${clientIp}`;

    // Public ticket creation
    if (
      req.method === "POST" &&
      pathname.includes("/queues/") &&
      pathname.endsWith("/tickets") &&
      pathname.startsWith("/api/public/")
    ) {
      const rateLimitRes = enforceRateLimit(
        `pub_ticket:${clientIp}`,
        RATE_LIMIT_CONFIGS.PUBLIC_TICKET_CREATE,
      );
      if (rateLimitRes) return rateLimitRes;
    }

    // Authenticated ticket creation
    else if (req.method === "POST" && pathname === "/api/tickets") {
      const rateLimitRes = enforceRateLimit(
        `auth_ticket:${actorKey}`,
        RATE_LIMIT_CONFIGS.AUTH_TICKET_CREATE,
      );
      if (rateLimitRes) return rateLimitRes;
    }

    // Appointment booking
    else if (req.method === "POST" && pathname === "/api/appointments") {
      const rateLimitRes = enforceRateLimit(
        `appt_create:${actorKey}`,
        RATE_LIMIT_CONFIGS.APPOINTMENT_CREATE,
      );
      if (rateLimitRes) return rateLimitRes;
    }

    // Appointment rescheduling and cancellations
    else if (
      pathname.startsWith("/api/appointments") &&
      (req.method === "PATCH" || req.method === "DELETE" || pathname.includes("/cancel"))
    ) {
      const rateLimitRes = enforceRateLimit(
        `appt_mutate:${actorKey}`,
        RATE_LIMIT_CONFIGS.APPOINTMENT_MUTATE,
      );
      if (rateLimitRes) return rateLimitRes;
    }

    // Public discovery endpoints (/api/public/**)
    else if (req.method === "GET" && pathname.startsWith("/api/public/")) {
      const rateLimitRes = enforceRateLimit(
        `pub_disc:${clientIp}`,
        RATE_LIMIT_CONFIGS.PUBLIC_DISCOVERY,
      );
      if (rateLimitRes) return rateLimitRes;
    }

    // Public tracking endpoints (/api/tickets/track/*)
    else if (pathname.startsWith("/api/tickets/track/")) {
      const rateLimitRes = enforceRateLimit(
        `track:${clientIp}`,
        RATE_LIMIT_CONFIGS.PUBLIC_TRACK,
      );
      if (rateLimitRes) return rateLimitRes;
    }

    // SSE connection establishment (/api/realtime/tickets/stream or staff/stream)
    else if (pathname.startsWith("/api/realtime/")) {
      const rateLimitRes = enforceRateLimit(
        `sse:${clientIp}`,
        RATE_LIMIT_CONFIGS.SSE_CONNECT,
      );
      if (rateLimitRes) return rateLimitRes;
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for Clerk's auto-proxy path
    "/__clerk/:path*",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
