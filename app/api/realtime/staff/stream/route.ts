import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/current-user";
import { broker } from "@/lib/realtime/broker";
import {
  staffOrgChannel,
  staffQueueChannel,
  type RealtimeEnvelope,
} from "@/lib/realtime/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_INTERVAL_MS = 15000;

interface StreamParams {
  organizationId: string;
  staffId?: string;
  queueIds?: string[];
}

async function handleStaffStream(request: Request, params: StreamParams) {
  // 1. Authenticate requesting operator
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { organizationId, staffId: requestedStaffId, queueIds: requestedQueueIds } = params;
  const trimmedOrgId = organizationId?.trim();

  if (!trimmedOrgId) {
    return Response.json(
      { error: "A valid organizationId is required" },
      { status: 400 },
    );
  }

  // 2. Authorize organization membership and staff/admin role (Tenant Isolation)
  const membership = await prisma.organizationMembership.findUnique({
    where: {
      userId_organizationId: {
        userId: currentUser.id,
        organizationId: trimmedOrgId,
      },
    },
  });

  if (
    !membership ||
    (membership.role !== "STAFF" && membership.role !== "ADMIN")
  ) {
    return Response.json(
      {
        error:
          "Forbidden: You are not authorized as staff or admin for this organization",
      },
      { status: 403 },
    );
  }

  // 3. If target staffId is provided, enforce staff vs admin view permissions
  // (Staff may view their own queues; admins may view any staff member's queues)
  if (requestedStaffId) {
    const trimmedStaffId = requestedStaffId.trim();
    if (trimmedStaffId && currentUser.id !== trimmedStaffId && membership.role !== "ADMIN") {
      return Response.json(
        { error: "You are not allowed to view this staff member's queues" },
        { status: 403 },
      );
    }

    if (trimmedStaffId && trimmedStaffId !== currentUser.id) {
      const targetMembership = await prisma.organizationMembership.findUnique({
        where: {
          userId_organizationId: {
            userId: trimmedStaffId,
            organizationId: trimmedOrgId,
          },
        },
      });

      if (
        !targetMembership ||
        (targetMembership.role !== "STAFF" && targetMembership.role !== "ADMIN")
      ) {
        return Response.json(
          { error: "Staff member not found in this organization" },
          { status: 404 },
        );
      }
    }
  }

  // 4. Resolve active queues strictly belonging to this organization
  const authorizedQueues = await prisma.queue.findMany({
    where: {
      service: {
        organizationId: trimmedOrgId,
      },
      isActive: true,
    },
    select: {
      id: true,
    },
  });

  const authorizedQueueIdSet = new Set(authorizedQueues.map((q) => q.id));

  // Restrict subscriptions to queues the staff member is authorized to access
  let subscribedQueueIds: string[];
  if (
    requestedQueueIds &&
    Array.isArray(requestedQueueIds) &&
    requestedQueueIds.length > 0
  ) {
    subscribedQueueIds = requestedQueueIds
      .filter((id) => typeof id === "string" && authorizedQueueIdSet.has(id.trim()))
      .map((id) => id.trim());
  } else {
    subscribedQueueIds = Array.from(authorizedQueueIdSet);
  }

  // 4. Establish SSE stream scoped to staff org channel and authorized queue channels
  const encoder = new TextEncoder();
  let isClosed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  const unsubscribers: (() => void)[] = [];

  const stream = new ReadableStream({
    start(controller) {
      function cleanup() {
        if (isClosed) return;
        isClosed = true;

        if (heartbeatTimer !== null) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        while (unsubscribers.length > 0) {
          const unsub = unsubscribers.pop();
          try {
            unsub?.();
          } catch {
            // ignore
          }
        }

        try {
          controller.close();
        } catch {
          // Stream already closed or cancelled
        }
      }

      function safeEnqueue(chunk: string) {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      }

      // Initial connection comment
      safeEnqueue(": connected\n\n");

      const handleEvent = (event: RealtimeEnvelope<unknown>) => {
        if (isClosed) return;
        const sseData = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
        safeEnqueue(sseData);
      };

      try {
        unsubscribers.push(
          broker.subscribe(staffOrgChannel(trimmedOrgId), handleEvent),
        );
        for (const qid of subscribedQueueIds) {
          unsubscribers.push(
            broker.subscribe(staffQueueChannel(qid), handleEvent),
          );
        }
      } catch (err) {
        console.error(
          `[StaffRealtime] Failed to subscribe to channels for org ${trimmedOrgId}:`,
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
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      while (unsubscribers.length > 0) {
        const unsub = unsubscribers.pop();
        try {
          unsub?.();
        } catch {
          // ignore
        }
      }
      isClosed = true;
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "A valid organizationId is required" },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("organizationId" in body) ||
    typeof (body as { organizationId: unknown }).organizationId !== "string"
  ) {
    return Response.json(
      { error: "A valid organizationId is required" },
      { status: 400 },
    );
  }

  const typedBody = body as {
    organizationId: string;
    staffId?: string;
    queueIds?: string[];
  };

  return handleStaffStream(request, {
    organizationId: typedBody.organizationId,
    staffId: typedBody.staffId,
    queueIds: typedBody.queueIds,
  });
}

export async function GET(request: Request) {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return Response.json({ error: "Invalid request URL" }, { status: 400 });
  }

  const organizationId = url.searchParams.get("organizationId");
  if (!organizationId) {
    return Response.json(
      { error: "A valid organizationId query parameter is required" },
      { status: 400 },
    );
  }

  const staffId = url.searchParams.get("staffId") ?? undefined;
  const queueParam = url.searchParams.getAll("queueIds");
  const commaQueueParam = url.searchParams.get("queueIds");
  let queueIds: string[] | undefined;

  if (queueParam.length > 1) {
    queueIds = queueParam;
  } else if (commaQueueParam) {
    queueIds = commaQueueParam.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return handleStaffStream(request, {
    organizationId,
    staffId,
    queueIds,
  });
}

