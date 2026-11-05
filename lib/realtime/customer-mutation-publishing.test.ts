import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { broker } from "@/lib/realtime/broker";
import {
  customerTicketChannel,
  type RealtimeEnvelope,
  type CustomerTicketCalledPayload,
  type CustomerTicketServingPayload,
  type CustomerTicketCompletedPayload,
  type CustomerTicketSkippedPayload,
  type CustomerTicketCancelledPayload,
} from "@/lib/realtime/types";

// Hoisted mocks for Prisma
const {
  mockTicketFindUnique,
  mockTicketFindUniqueOrThrow,
  mockTicketFindFirst,
  mockTicketUpdateMany,
  mockQueryRaw,
  mockTransaction,
  mockCounterFindFirst,
  mockStaffCounterAssignmentFindUnique,
  mockOrganizationMembershipFindUnique,
  mockUserFindUnique,
  mockQueueFindUnique,
} = vi.hoisted(() => ({
  mockTicketFindUnique: vi.fn(),
  mockTicketFindUniqueOrThrow: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketUpdateMany: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTransaction: vi.fn(),
  mockCounterFindFirst: vi.fn(),
  mockStaffCounterAssignmentFindUnique: vi.fn(),
  mockOrganizationMembershipFindUnique: vi.fn(),
  mockUserFindUnique: vi.fn(),
  mockQueueFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    queue: {
      findUnique: mockQueueFindUnique,
    },
    ticket: {
      findUnique: mockTicketFindUnique,
      findUniqueOrThrow: mockTicketFindUniqueOrThrow,
      findFirst: mockTicketFindFirst,
      updateMany: mockTicketUpdateMany,
    },
    counter: {
      findFirst: mockCounterFindFirst,
    },
    staffCounterAssignment: {
      findUnique: mockStaffCounterAssignmentFindUnique,
    },
    organizationMembership: {
      findUnique: mockOrganizationMembershipFindUnique,
    },
    user: {
      findUnique: mockUserFindUnique,
    },
    $queryRaw: mockQueryRaw,
    $transaction: mockTransaction,
  },
}));

// Mock current user as staff
let mockCurrentUser: { id: string } | null = { id: "staff-user-1" };
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => Promise.resolve(mockCurrentUser),
}));

// Import the mutation route handlers
import { PATCH as callNextTicket } from "@/app/api/queues/[id]/next/route";
import { PATCH as callSpecificTicket } from "@/app/api/tickets/[id]/call/route";
import { PATCH as startTicket } from "@/app/api/tickets/[id]/start/route";
import { PATCH as completeTicket } from "@/app/api/tickets/[id]/complete/route";
import { PATCH as skipTicket } from "@/app/api/tickets/[id]/skip/route";
import { PATCH as cancelTicketAuth } from "@/app/api/tickets/[id]/cancel/route";
import { PATCH as cancelTicketTrackToken } from "@/app/api/tickets/track/[trackingToken]/cancel/route";
import { POST as customerSseEndpoint } from "@/app/api/realtime/tickets/stream/route";

describe("Phase 3A: Post-Commit Customer Event Publishing", () => {
  const trackingToken =
    "5f2d4e8a1b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e";
  const channel = customerTicketChannel(trackingToken);

  beforeEach(() => {
    vi.clearAllMocks();
    broker.clear();
    mockCurrentUser = { id: "staff-user-1" };

    mockQueryRaw.mockResolvedValue([{ id: "staff-user-1", status: "WAITING" }]);
    mockTicketUpdateMany.mockResolvedValue({ count: 1 });
    mockQueueFindUnique.mockResolvedValue({
      id: "queue-1",
      isActive: true,
      service: {
        isActive: true,
        organizationId: "org-1",
        organization: { id: "org-1", timezone: "UTC" },
      },
    });

    // Default mock transaction execution: runs the interactive callback
    mockTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: mockQueryRaw,
          ticket: {
            findFirst: mockTicketFindFirst,
            findUnique: mockTicketFindUnique,
            findUniqueOrThrow: mockTicketFindUniqueOrThrow,
            updateMany: mockTicketUpdateMany,
          },
        };
        return callback(tx);
      },
    );
  });

  afterEach(() => {
    broker.clear();
  });

  describe("1. Ticket Called (Call Next & Call Specific)", () => {
    it("publishes TICKET_CALLED to the customer channel upon successful /next", async () => {
      const received: RealtimeEnvelope<CustomerTicketCalledPayload>[] = [];
      broker.subscribe<CustomerTicketCalledPayload>(channel, (event) => {
        received.push(event);
      });

      // Mock queue setup
      vi.mocked(mockCounterFindFirst).mockResolvedValue({
        id: "counter-1",
        name: "Window 3",
        organizationId: "org-1",
        isActive: true,
      });

      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-1",
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockTicketFindUnique.mockResolvedValue({
        id: "queue-1",
        isActive: true,
        service: {
          isActive: true,
          organizationId: "org-1",
          organization: { id: "org-1", timezone: "UTC" },
        },
      });

      mockTicketFindFirst.mockResolvedValue(null); // No existing active ticket for staff

      // $queryRaw for next ticket
      mockQueryRaw
        .mockResolvedValueOnce([{ id: "staff-user-1" }]) // FOR UPDATE lock on user
        .mockResolvedValueOnce([{ id: "ticket-10" }]); // next ticket

      mockTicketFindUniqueOrThrow.mockResolvedValue({
        id: "ticket-10",
        number: 10,
        status: "CALLED",
        counterId: "counter-1",
        trackingToken,
      });

      const response = await callNextTicket(
        new Request("http://localhost", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterId: "counter-1" }),
        }),
        { params: Promise.resolve({ id: "queue-1" }) },
      );

      expect(response.status).toBe(200);

      // Verify event publication
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_CALLED");
      expect(received[0].channel).toBe(channel);
      expect(received[0].payload).toEqual({
        ticketNumber: 10,
        status: "CALLED",
        counterName: "Window 3",
      });
      // Verify no sensitive fields leaked
      expect(
        (received[0].payload as unknown as Record<string, unknown>).staffId,
      ).toBeUndefined();
      expect(
        (received[0].payload as unknown as Record<string, unknown>)
          .trackingToken,
      ).toBeUndefined();
    });

    it("publishes TICKET_CALLED to the customer channel upon successful specific ticket /call", async () => {
      const received: RealtimeEnvelope<CustomerTicketCalledPayload>[] = [];
      broker.subscribe<CustomerTicketCalledPayload>(channel, (event) => {
        received.push(event);
      });

      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-12",
        status: "WAITING",
        queue: {
          isActive: true,
          service: {
            isActive: true,
            organizationId: "org-1",
            organization: { id: "org-1", timezone: "UTC" },
          },
        },
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-2",
      });

      mockCounterFindFirst.mockResolvedValue({
        id: "counter-2",
        name: "Desk 2",
        organizationId: "org-1",
        isActive: true,
      });

      mockTicketFindFirst.mockResolvedValue(null);

      mockTicketFindUniqueOrThrow.mockResolvedValue({
        id: "ticket-12",
        number: 12,
        status: "CALLED",
        counterId: "counter-2",
        trackingToken,
      });

      const response = await callSpecificTicket(
        new Request("http://localhost", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterId: "counter-2" }),
        }),
        { params: Promise.resolve({ id: "ticket-12" }) },
      );

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_CALLED");
      expect(received[0].payload).toEqual({
        ticketNumber: 12,
        status: "CALLED",
        counterName: "Desk 2",
      });
    });
  });

  describe("2. Ticket Serving (Start Service)", () => {
    it("publishes TICKET_SERVING upon successful /start", async () => {
      const received: RealtimeEnvelope<CustomerTicketServingPayload>[] = [];
      broker.subscribe<CustomerTicketServingPayload>(channel, (event) => {
        received.push(event);
      });

      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-15",
        status: "CALLED",
        servedById: "staff-user-1",
        counterId: "counter-1",
        queue: {
          service: { organizationId: "org-1" },
        },
        counter: { name: "Station 1" },
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-1",
      });

      mockTicketFindUniqueOrThrow.mockResolvedValue({
        id: "ticket-15",
        number: 15,
        status: "SERVING",
        trackingToken,
      });

      const response = await startTicket(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ id: "ticket-15" }),
        },
      );

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_SERVING");
      expect(received[0].payload).toEqual({
        ticketNumber: 15,
        status: "SERVING",
        counterName: "Station 1",
      });
    });
  });

  describe("3. Ticket Completed", () => {
    it("publishes TICKET_COMPLETED upon successful /complete", async () => {
      const received: RealtimeEnvelope<CustomerTicketCompletedPayload>[] = [];
      broker.subscribe<CustomerTicketCompletedPayload>(channel, (event) => {
        received.push(event);
      });

      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-15",
        status: "SERVING",
        servedById: "staff-user-1",
        counterId: "counter-1",
        queue: {
          service: { organizationId: "org-1" },
        },
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-1",
      });

      mockCounterFindFirst.mockResolvedValue({
        id: "counter-1",
        organizationId: "org-1",
      });

      mockTicketFindUniqueOrThrow.mockResolvedValue({
        id: "ticket-15",
        number: 15,
        status: "COMPLETED",
        trackingToken,
      });

      const response = await completeTicket(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ id: "ticket-15" }),
        },
      );

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_COMPLETED");
      expect(received[0].payload).toEqual({
        ticketNumber: 15,
        status: "COMPLETED",
      });
    });
  });

  describe("4. Ticket Skipped", () => {
    it("publishes TICKET_SKIPPED upon successful /skip", async () => {
      const received: RealtimeEnvelope<CustomerTicketSkippedPayload>[] = [];
      broker.subscribe<CustomerTicketSkippedPayload>(channel, (event) => {
        received.push(event);
      });

      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-20",
        status: "CALLED",
        servedById: "staff-user-1",
        counterId: "counter-1",
        queue: {
          service: { organizationId: "org-1" },
        },
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockTicketFindUniqueOrThrow.mockResolvedValue({
        id: "ticket-20",
        number: 20,
        status: "SKIPPED",
        trackingToken,
      });

      const response = await skipTicket(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ id: "ticket-20" }),
        },
      );

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_SKIPPED");
      expect(received[0].payload).toEqual({
        ticketNumber: 20,
        status: "SKIPPED",
      });
    });
  });

  describe("5. Ticket Cancelled (Authenticated & Public Token)", () => {
    it("publishes TICKET_CANCELLED upon successful staff/user cancel (/api/tickets/[id]/cancel)", async () => {
      const received: RealtimeEnvelope<CustomerTicketCancelledPayload>[] = [];
      broker.subscribe<CustomerTicketCancelledPayload>(channel, (event) => {
        received.push(event);
      });

      mockQueryRaw.mockResolvedValue([{ id: "ticket-30" }]);
      mockTicketFindUniqueOrThrow
        .mockResolvedValueOnce({
          id: "ticket-30",
          userId: "staff-user-1",
          status: "WAITING",
        })
        .mockResolvedValueOnce({
          id: "ticket-30",
          number: 30,
          status: "CANCELLED",
          trackingToken,
        });

      const response = await cancelTicketAuth(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ id: "ticket-30" }),
        },
      );

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_CANCELLED");
      expect(received[0].payload).toEqual({
        ticketNumber: 30,
        status: "CANCELLED",
      });
    });

    it("publishes TICKET_CANCELLED upon successful customer public tracking cancel (/api/tickets/track/[trackingToken]/cancel)", async () => {
      const received: RealtimeEnvelope<CustomerTicketCancelledPayload>[] = [];
      broker.subscribe<CustomerTicketCancelledPayload>(channel, (event) => {
        received.push(event);
      });

      mockQueryRaw.mockResolvedValue([{ id: "ticket-35", status: "WAITING" }]);
      mockTicketFindUniqueOrThrow.mockResolvedValue({
        number: 35,
        status: "CANCELLED",
        cancelledAt: new Date(),
      });

      const response = await cancelTicketTrackToken(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ trackingToken }),
        },
      );

      expect(response.status).toBe(200);
      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_CANCELLED");
      expect(received[0].payload).toEqual({
        ticketNumber: 35,
        status: "CANCELLED",
      });
    });
  });

  describe("6. Transaction Rollback & Failure Guarantees", () => {
    it("publishes exactly zero events when a transaction fails or rolls back", async () => {
      const received: RealtimeEnvelope<unknown>[] = [];
      broker.subscribe(channel, (e) => received.push(e));

      // Simulate conflict during start
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-fail",
        status: "CALLED",
        servedById: "staff-user-1",
        counterId: "counter-1",
        queue: { service: { organizationId: "org-1" } },
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-1",
      });

      // Transaction update fails with conflict (0 rows affected)
      mockTicketUpdateMany.mockResolvedValue({ count: 0 });

      const response = await startTicket(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ id: "ticket-fail" }),
        },
      );

      expect(response.status).toBe(409);
      // Zero events dispatched!
      expect(received).toHaveLength(0);
    });

    it("publishes zero events when database transaction throws a fatal connection error", async () => {
      const received: RealtimeEnvelope<unknown>[] = [];
      broker.subscribe(channel, (e) => received.push(e));

      mockTransaction.mockRejectedValue(new Error("Database connection lost"));

      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-err",
        status: "SERVING",
        servedById: "staff-user-1",
        counterId: "counter-1",
        queue: { service: { organizationId: "org-1" } },
      });

      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });

      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-1",
      });

      mockCounterFindFirst.mockResolvedValue({
        id: "counter-1",
        organizationId: "org-1",
      });

      const response = await completeTicket(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ id: "ticket-err" }),
        },
      );

      expect(response.status).toBe(500);
      expect(received).toHaveLength(0);
    });
  });

  describe("7. Channel Isolation", () => {
    it("delivers events only to the specific ticket channel and not to unrelated tokens", async () => {
      const otherChannel = customerTicketChannel("other-random-token-999");
      const otherReceived: RealtimeEnvelope<unknown>[] = [];
      broker.subscribe(otherChannel, (e) => otherReceived.push(e));

      mockQueryRaw.mockResolvedValue([
        { id: "ticket-isolate", status: "WAITING" },
      ]);
      mockTicketFindUniqueOrThrow.mockResolvedValue({
        number: 50,
        status: "CANCELLED",
        cancelledAt: new Date(),
      });

      await cancelTicketTrackToken(
        new Request("http://localhost", { method: "PATCH" }),
        {
          params: Promise.resolve({ trackingToken }),
        },
      );

      // Other channel receives nothing
      expect(otherReceived).toHaveLength(0);
    });
  });

  describe("8. Direct End-to-End: Mutation Route -> Broker -> SSE Stream", () => {
    it("delivers real-time SSE event to connected customer stream when ticket is called via mutation route", async () => {
      // 1. Setup ticket in DB for SSE endpoint authorization
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-e2e",
        status: "WAITING",
        number: 77,
        counter: { name: "Counter 5" },
        queue: {
          isActive: true,
          service: {
            isActive: true,
            organizationId: "org-1",
            organization: { id: "org-1", timezone: "UTC" },
          },
        },
      });

      // 2. Open SSE stream via secure POST body
      const sseResponse = await customerSseEndpoint(
        new Request("http://localhost/api/realtime/tickets/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackingToken }),
        }),
      );

      expect(sseResponse.status).toBe(200);
      const reader = sseResponse.body!.getReader();
      // Read initial ": connected\n\n"
      const initialChunk = await reader.read();
      expect(new TextDecoder().decode(initialChunk.value)).toBe(
        ": connected\n\n",
      );

      // 3. Setup staff authorization and perform mutation PATCH
      mockOrganizationMembershipFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        organizationId: "org-1",
        role: "STAFF",
      });
      mockStaffCounterAssignmentFindUnique.mockResolvedValue({
        userId: "staff-user-1",
        counterId: "counter-5",
      });
      mockCounterFindFirst.mockResolvedValue({
        id: "counter-5",
        name: "Counter 5",
        organizationId: "org-1",
        isActive: true,
      });
      mockTicketFindFirst.mockResolvedValue(null);
      mockTicketFindUniqueOrThrow.mockResolvedValue({
        id: "ticket-e2e",
        number: 77,
        status: "CALLED",
        counterId: "counter-5",
        trackingToken,
      });

      // 4. Perform actual mutation PATCH call
      const mutationResponse = await callSpecificTicket(
        new Request("http://localhost", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ counterId: "counter-5" }),
        }),
        { params: Promise.resolve({ id: "ticket-e2e" }) },
      );

      expect(mutationResponse.status).toBe(200);

      // 5. Read from the active SSE stream!
      const streamChunk = await reader.read();
      expect(streamChunk.done).toBe(false);
      const sseText = new TextDecoder().decode(streamChunk.value);

      expect(sseText).toContain("event: TICKET_CALLED\n");
      expect(sseText).toContain(
        'data: {"ticketNumber":77,"status":"CALLED","counterName":"Counter 5"}\n\n',
      );

      await reader.cancel();
    });
  });
});
