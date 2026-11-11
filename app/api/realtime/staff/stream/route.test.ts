import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { broker } from "@/lib/realtime/broker";
import {
  staffOrgChannel,
  staffQueueChannel,
  customerQueueChannel,
  type RealtimeEnvelope,
  type CustomerQueueInvalidatedPayload,
} from "@/lib/realtime/types";

// Hoisted mocks for Prisma
const {
  mockGetCurrentUser,
  mockOrganizationMembershipFindUnique,
  mockQueueFindMany,
  mockQueueFindUnique,
  mockTicketFindFirst,
  mockTicketCreate,
  mockQueryRaw,
  mockTransaction,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockOrganizationMembershipFindUnique: vi.fn(),
  mockQueueFindMany: vi.fn(),
  mockQueueFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCreate: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockOrganizationMembershipFindUnique,
    },
    queue: {
      findMany: mockQueueFindMany,
      findUnique: mockQueueFindUnique,
    },
    ticket: {
      findFirst: mockTicketFindFirst,
      create: mockTicketCreate,
    },
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  },
}));

import { POST as staffSseEndpoint, GET as staffSseGetEndpoint } from "./route";
import { POST as createTicketAuth } from "@/app/api/tickets/route";
import { POST as createTicketPublic } from "@/app/api/public/organizations/[organizationId]/services/[serviceId]/queues/[queueId]/tickets/route";

describe("Staff-Side SSE & Real-Time Ticket Creation", () => {
  const orgId = "org_bank_123";
  const queueId1 = "queue_teller_1";
  const queueId2 = "queue_teller_2";
  const foreignQueueId = "queue_unauthorized_999";
  const staffUserId = "user_staff_456";

  beforeEach(() => {
    vi.clearAllMocks();
    broker.clear();

    mockGetCurrentUser.mockResolvedValue({
      id: staffUserId,
      email: "staff@example.com",
    });

    mockOrganizationMembershipFindUnique.mockResolvedValue({
      userId: staffUserId,
      organizationId: orgId,
      role: "STAFF",
    });

    mockQueueFindMany.mockResolvedValue([
      { id: queueId1 },
      { id: queueId2 },
    ]);
  });

  afterEach(() => {
    broker.clear();
  });

  describe("1. Authentication and Authorization", () => {
    it("returns 401 when the operator is unauthenticated", async () => {
      mockGetCurrentUser.mockResolvedValue(null);

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    });

    it("returns 400 when organizationId is missing or empty", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "   " }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: "A valid organizationId is required",
      });
    });

    it("returns 403 when the user is not a member of the organization", async () => {
      mockOrganizationMembershipFindUnique.mockResolvedValue(null);

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error:
          "Forbidden: You are not authorized as staff or admin for this organization",
      });
    });

    it("returns 403 when the user has an unpermitted role (e.g., CUSTOMER)", async () => {
      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: staffUserId,
        organizationId: orgId,
        role: "CUSTOMER",
      });

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(403);
    });

    it("returns 403 when a STAFF member attempts to stream queues for another staff member", async () => {
      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: staffUserId,
        organizationId: orgId,
        role: "STAFF",
      });

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          staffId: "other-staff-user",
        }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "You are not allowed to view this staff member's queues",
      });
    });

    it("returns 404 when target staff member is not found in the organization", async () => {
      // Current user is ADMIN
      mockOrganizationMembershipFindUnique.mockImplementation(
        async ({ where: { userId_organizationId } }) => {
          if (userId_organizationId.userId === staffUserId) {
            return {
              userId: staffUserId,
              organizationId: orgId,
              role: "ADMIN",
            };
          }
          return null; // target staff member not found
        },
      );

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          staffId: "nonexistent-staff",
        }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: "Staff member not found in this organization",
      });
    });

    it("allows ADMIN members to stream queues specifying another valid staff member", async () => {
      mockOrganizationMembershipFindUnique.mockImplementation(
        async ({ where: { userId_organizationId } }) => {
          if (userId_organizationId.userId === staffUserId) {
            return {
              userId: staffUserId,
              organizationId: orgId,
              role: "ADMIN",
            };
          }
          if (userId_organizationId.userId === "other-staff-user") {
            return {
              userId: "other-staff-user",
              organizationId: orgId,
              role: "STAFF",
            };
          }
          return null;
        },
      );

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          staffId: "other-staff-user",
        }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/event-stream; charset=utf-8",
      );
    });

    it("allows ADMIN members to subscribe to the staff stream", async () => {
      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: staffUserId,
        organizationId: orgId,
        role: "ADMIN",
      });

      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/event-stream; charset=utf-8",
      );
      expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    });
  });

  describe("2. Stream Establishment & SSE Headers", () => {
    it("returns 200 with standard SSE headers for authorized staff", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/event-stream; charset=utf-8",
      );
      expect(response.headers.get("Cache-Control")).toContain("no-cache");
      expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    });

    it("supports GET requests with query parameter organizationId", async () => {
      const request = new Request(
        `http://localhost/api/realtime/staff/stream?organizationId=${encodeURIComponent(orgId)}`,
        {
          method: "GET",
        },
      );

      const response = await staffSseGetEndpoint(request);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(
        "text/event-stream; charset=utf-8",
      );
    });

    it("emits initial ': connected' comment on stream start", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      expect(response.body).toBeDefined();

      const reader = response.body!.getReader();
      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain(": connected\n\n");
      await reader.cancel();
    });
  });

  describe("3. Channel Scoping & Tenant Isolation", () => {
    it("subscribes staff strictly to org channel and authorized queue channels", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      const reader = response.body!.getReader();
      // Read initial comment
      await reader.read();

      expect(broker.listenerCount(staffOrgChannel(orgId))).toBe(1);
      expect(broker.listenerCount(staffQueueChannel(queueId1))).toBe(1);
      expect(broker.listenerCount(staffQueueChannel(queueId2))).toBe(1);
      // Unauthorized/foreign queue has 0 listeners
      expect(broker.listenerCount(staffQueueChannel(foreignQueueId))).toBe(0);

      await reader.cancel();
    });

    it("never subscribes to unauthorized/unassigned queues even if requested in client body", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          queueIds: [queueId1, foreignQueueId], // foreignQueueId does not belong to org
        }),
      });

      const response = await staffSseEndpoint(request);
      const reader = response.body!.getReader();
      await reader.read();

      // Only queueId1 was authorized and subscribed
      expect(broker.listenerCount(staffQueueChannel(queueId1))).toBe(1);
      expect(broker.listenerCount(staffQueueChannel(foreignQueueId))).toBe(0);

      await reader.cancel();
    });

    it("delivers events on authorized queue channel to the staff stream", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      const reader = response.body!.getReader();
      // Read initial connection comment
      await reader.read();

      // Publish an event on authorized queue channel
      broker.publish({
        type: "QUEUE_INVALIDATED",
        channel: staffQueueChannel(queueId1),
        timestamp: new Date().toISOString(),
        payload: {
          queueId: queueId1,
          reason: "TICKET_CREATED",
          timestamp: Date.now(),
        },
      });

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain("event: QUEUE_INVALIDATED");
      expect(text).toContain(`"queueId":"${queueId1}"`);
      expect(text).toContain(`"reason":"TICKET_CREATED"`);

      await reader.cancel();
    });

    it("does NOT deliver events from unauthorized or foreign queues", async () => {
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });

      const response = await staffSseEndpoint(request);
      const reader = response.body!.getReader();
      await reader.read();

      // Publish event on unauthorized queue
      broker.publish({
        type: "QUEUE_INVALIDATED",
        channel: staffQueueChannel(foreignQueueId),
        timestamp: new Date().toISOString(),
        payload: {
          queueId: foreignQueueId,
          reason: "TICKET_CREATED",
          timestamp: Date.now(),
        },
      });

      // Also publish an event on customer-only channel
      broker.publish({
        type: "QUEUE_INVALIDATED",
        channel: customerQueueChannel(queueId1),
        timestamp: new Date().toISOString(),
        payload: {
          queueId: queueId1,
          reason: "TICKET_CREATED",
          timestamp: Date.now(),
        },
      });

      // Now publish an event on authorized queue to unblock reader
      broker.publish({
        type: "QUEUE_INVALIDATED",
        channel: staffQueueChannel(queueId2),
        timestamp: new Date().toISOString(),
        payload: {
          queueId: queueId2,
          reason: "TICKET_CREATED",
          timestamp: Date.now(),
        },
      });

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      // Only queueId2 should have been delivered; foreignQueueId was never sent
      expect(text).toContain(`"queueId":"${queueId2}"`);
      expect(text).not.toContain(foreignQueueId);

      await reader.cancel();
    });

    it("cleans up broker subscriptions when request is aborted", async () => {
      const abortController = new AbortController();
      const request = new Request("http://localhost/api/realtime/staff/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
        signal: abortController.signal,
      });

      const response = await staffSseEndpoint(request);
      const reader = response.body!.getReader();
      await reader.read();

      expect(broker.listenerCount(staffQueueChannel(queueId1))).toBe(1);

      // Abort request
      abortController.abort();

      // Subscriptions are removed
      expect(broker.listenerCount(staffQueueChannel(queueId1))).toBe(0);
      expect(broker.listenerCount(staffOrgChannel(orgId))).toBe(0);
    });
  });

  describe("4. Ticket Creation Realtime Dispatching (Post-Commit)", () => {
    const defaultOpenOrg = {
      id: orgId,
      timezone: "UTC",
      scheduleIntervals: [
        {
          id: "int-1",
          dayOfWeek: new Date().getUTCDay(),
          startTime: "00:00",
          endTime: "23:59",
          isActive: true,
        },
      ],
      closures: [],
    };

    beforeEach(() => {
      mockTransaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) => {
          const tx = {
            queue: {
              findUnique: mockQueueFindUnique,
            },
            ticket: {
              findFirst: mockTicketFindFirst,
              create: mockTicketCreate,
              count: vi.fn().mockResolvedValue(0),
            },
            $queryRaw: mockQueryRaw,
          };
          return callback(tx);
        },
      );
    });

    it("publishes QUEUE_INVALIDATED to staffQueueChannel on successful authenticated ticket creation", async () => {
      const receivedStaffEvents: RealtimeEnvelope<CustomerQueueInvalidatedPayload>[] =
        [];
      broker.subscribe<CustomerQueueInvalidatedPayload>(
        staffQueueChannel(queueId1),
        (event) => {
          receivedStaffEvents.push(event);
        },
      );

      mockGetCurrentUser.mockResolvedValue({ id: "customer-user-1" });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId1,
        isActive: true,
        maxWaitingTickets: 100,
        maxDailyTickets: 100,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 42 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({
        id: "tick-new-1",
        number: 42,
        queueId: queueId1,
        userId: "customer-user-1",
        status: "WAITING",
        trackingToken: "token-123",
      });

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: queueId1 }),
      });

      const response = await createTicketAuth(request);
      expect(response.status).toBe(201);

      // Event was dispatched to staffQueueChannel
      expect(receivedStaffEvents).toHaveLength(1);
      expect(receivedStaffEvents[0].type).toBe("QUEUE_INVALIDATED");
      expect(receivedStaffEvents[0].channel).toBe(staffQueueChannel(queueId1));
      expect(receivedStaffEvents[0].payload.queueId).toBe(queueId1);
      expect(receivedStaffEvents[0].payload.reason).toBe("TICKET_CREATED");
    });

    it("publishes QUEUE_INVALIDATED to staffQueueChannel on successful public ticket creation", async () => {
      const receivedStaffEvents: RealtimeEnvelope<CustomerQueueInvalidatedPayload>[] =
        [];
      broker.subscribe<CustomerQueueInvalidatedPayload>(
        staffQueueChannel(queueId1),
        (event) => {
          receivedStaffEvents.push(event);
        },
      );

      mockGetCurrentUser.mockResolvedValue({ id: "customer-user-2" });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId1,
        isActive: true,
        serviceId: "svc-1",
        maxWaitingTickets: 100,
        maxDailyTickets: 100,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organizationId: orgId,
          organization: defaultOpenOrg,
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 43 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockResolvedValue({
        id: "tick-new-2",
        number: 43,
        queueId: queueId1,
        userId: "customer-user-2",
        status: "WAITING",
        trackingToken: "token-456",
      });

      const request = new Request("http://localhost/api/public/...", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await createTicketPublic(request, {
        params: Promise.resolve({
          organizationId: orgId,
          serviceId: "svc-1",
          queueId: queueId1,
        }),
      });

      expect(response.status).toBe(201);
      expect(receivedStaffEvents).toHaveLength(1);
      expect(receivedStaffEvents[0].type).toBe("QUEUE_INVALIDATED");
      expect(receivedStaffEvents[0].channel).toBe(staffQueueChannel(queueId1));
      expect(receivedStaffEvents[0].payload.queueId).toBe(queueId1);
      expect(receivedStaffEvents[0].payload.reason).toBe("TICKET_CREATED");
    });

    it("publishes zero events if database transaction rolls back or fails", async () => {
      const receivedStaffEvents: RealtimeEnvelope<CustomerQueueInvalidatedPayload>[] =
        [];
      broker.subscribe<CustomerQueueInvalidatedPayload>(
        staffQueueChannel(queueId1),
        (event) => {
          receivedStaffEvents.push(event);
        },
      );

      mockGetCurrentUser.mockResolvedValue({ id: "customer-user-1" });
      mockQueueFindUnique.mockResolvedValue({
        id: queueId1,
        isActive: true,
        maxWaitingTickets: 100,
        maxDailyTickets: 100,
        service: {
          id: "svc-1",
          isActive: true,
          admissionCutoffMinutes: null,
          organization: defaultOpenOrg,
        },
      });
      mockQueryRaw.mockResolvedValue([{ number: 42 }]);
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketCreate.mockRejectedValue(new Error("Database write failure"));

      const request = new Request("http://localhost/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId: queueId1 }),
      });

      const response = await createTicketAuth(request);
      expect(response.status).toBe(500);

      // Absolutely zero events dispatched!
      expect(receivedStaffEvents).toHaveLength(0);
    });
  });
});

