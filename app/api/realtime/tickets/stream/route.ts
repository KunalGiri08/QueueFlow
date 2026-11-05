import { prisma } from "@/lib/prisma";
import { broker } from "@/lib/realtime/broker";
import {
  customerTicketChannel,
  type RealtimeEnvelope,
  type RealtimeEventType,
} from "@/lib/realtime/types";
import { isTicketActive } from "@/lib/formatters/ticket";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * Sanitizes real-time event payloads to ensure zero leakage of customer PII,
 * staff IDs, internal database IDs, or sensitive operational metadata to public streams.
 */
function sanitizeCustomerEventPayload(
  type: RealtimeEventType,
  rawPayload: unknown,
): Record<string, unknown> {
  if (typeof rawPayload !== "object" || rawPayload === null) {
    return {};
  }
  const payload = rawPayload as Record<string, unknown>;

  switch (type) {
    case "TICKET_CALLED":
      return {
        ticketNumber: payload.ticketNumber,
        status: "CALLED",
        counterName: payload.counterName ?? "",
      };
    case "TICKET_SERVING":
      return {
        ticketNumber: payload.ticketNumber,
        status: "SERVING",
        counterName: payload.counterName ?? "",
      };
    case "TICKET_COMPLETED":
      return {
        ticketNumber: payload.ticketNumber,
        status: "COMPLETED",
      };
    case "TICKET_SKIPPED":
      return {
        ticketNumber: payload.ticketNumber,
        status: "SKIPPED",
      };
    case "TICKET_CANCELLED":
      return {
        ticketNumber: payload.ticketNumber,
        status: "CANCELLED",
      };
    case "QUEUE_STATUS_CHANGED":
      return {
        queueId: payload.queueId,
        isActive: Boolean(payload.isActive),
      };
    default:
      return {};
  }
}

/**
 * Masks a tracking token for safe diagnostic logging without exposing the raw secret.
 */
function maskTrackingToken(token: string): string {
  if (!token) return "[EMPTY]";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function POST(request: Request) {
  // Reject requests attempting to pass trackingToken in URL query parameters
  try {
    const url = new URL(request.url);
    if (url.searchParams.has("trackingToken")) {
      return Response.json(
        { error: "Tracking token must not be passed in the URL" },
        { status: 400 },
      );
    }
  } catch {
    // If URL parsing fails, proceed to body validation
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "A valid tracking token is required" },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("trackingToken" in body) ||
    typeof (body as { trackingToken: unknown }).trackingToken !== "string"
  ) {
    return Response.json(
      { error: "A valid tracking token is required" },
      { status: 400 },
    );
  }

  const token = (body as { trackingToken: string }).trackingToken.trim();
  if (!token) {
    return Response.json(
      { error: "A valid tracking token is required" },
      { status: 400 },
    );
  }

  // 1. Authorize: Verify ticket exists in PostgreSQL
  let ticket: { id: string; status: string; number: number } | null = null;
  try {
    ticket = await prisma.ticket.findUnique({
      where: { trackingToken: token },
      select: {
        id: true,
        status: true,
        number: true,
      },
    });
  } catch (error) {
    console.error(
      `[Realtime] Failed to verify ticket for token ${maskTrackingToken(token)}:`,
      error,
    );
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  if (!ticket) {
    return Response.json(
      { error: "Invalid tracking token" },
      { status: 401 },
    );
  }

  // 2. Reject already terminal tickets so clients do not hold open dead connections
  if (!isTicketActive(ticket.status)) {
    return Response.json(
      {
        error: "Ticket is in a terminal state",
        status: ticket.status,
      },
      { status: 410 },
    );
  }

  // 3. Establish SSE stream scoped strictly to this ticket's customer channel
  const channel = customerTicketChannel(token);
  const encoder = new TextEncoder();

  let isClosed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      function cleanup() {
        if (isClosed) return;
        isClosed = true;

        if (heartbeatTimer !== null) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        if (unsubscribe !== null) {
          unsubscribe();
          unsubscribe = null;
        }

        try {
          controller.close();
        } catch {
          // Stream already closed or cancelled
        }
      }

      // Safe enqueue helper
      function safeEnqueue(chunk: string) {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      }

      // Send initial connection comment
      safeEnqueue(": connected\n\n");

      // Subscribe to customer channel on broker
      try {
        unsubscribe = broker.subscribe(
          channel,
          (event: RealtimeEnvelope<unknown>) => {
            if (isClosed) return;
            const sanitized = sanitizeCustomerEventPayload(
              event.type,
              event.payload,
            );
            const sseData = `event: ${event.type}\ndata: ${JSON.stringify(sanitized)}\n\n`;
            safeEnqueue(sseData);

            // If terminal event received, close stream after delivering
            if (
              event.type === "TICKET_COMPLETED" ||
              event.type === "TICKET_SKIPPED" ||
              event.type === "TICKET_CANCELLED"
            ) {
              cleanup();
            }
          },
        );
      } catch (err) {
        console.error(
          `[Realtime] Failed to subscribe to channel for token ${maskTrackingToken(token)}:`,
          err,
        );
        cleanup();
        return;
      }

      // Periodic heartbeat comment to prevent proxy / ALB idle timeouts
      heartbeatTimer = setInterval(() => {
        if (isClosed) return;
        safeEnqueue(": heartbeat\n\n");
      }, HEARTBEAT_INTERVAL_MS);

      // Handle client disconnect via AbortSignal
      request.signal.addEventListener("abort", () => {
        cleanup();
      });
    },
    cancel() {
      // Called when consumer closes or cancels stream
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (unsubscribe !== null) {
        unsubscribe();
        unsubscribe = null;
      }
      isClosed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, no-store",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  return Response.json(
    { error: "Method not allowed. Use POST /api/realtime/tickets/stream with a JSON body." },
    {
      status: 405,
      headers: { Allow: "POST" },
    },
  );
}

