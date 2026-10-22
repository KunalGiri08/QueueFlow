import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockTicketFindUnique,
  mockMembershipFindUnique,
  mockTicketCount,
  mockTicketFindFirst,
  mockTicketFindMany,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockTicketFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockTicketCount: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketFindMany: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      findUnique: mockTicketFindUnique,
      count: mockTicketCount,
      findFirst: mockTicketFindFirst,
      findMany: mockTicketFindMany,
    },
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
  },
}));

import { GET } from "./route";

const ticketId = "ticket-1";
const organizationId = "org-1";
const ownerId = "user-customer-1";

const params = Promise.resolve({ id: ticketId });

const baseTicket = {
  id: ticketId,
  number: 42,
  status: "CALLED",
  userId: ownerId,
  queueId: "queue-1",
  queue: {
    id: "queue-1",
    name: "General Queue",
    service: {
      id: "service-1",
      name: "General Service",
      organizationId,
      organization: {
        id: organizationId,
        name: "Test Organization",
      },
    },
  },
  counter: {
    id: "counter-1",
    name: "Desk 1",
  },
};

describe("GET /api/tickets/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketCount.mockResolvedValue(0);
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketFindMany.mockResolvedValue([]);
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the ticket does not exist", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-123" });
    mockTicketFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
  });

  it("returns 404 (preventing enumeration) when caller is neither owner nor an org member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "another-customer" });
    mockTicketFindUnique.mockResolvedValue(baseTicket);
    mockMembershipFindUnique.mockResolvedValue(null); // Not a member of org-1

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
    expect(mockMembershipFindUnique).toHaveBeenCalledWith({
      where: {
        userId_organizationId: {
          userId: "another-customer",
          organizationId,
        },
      },
    });
  });

  it("returns 404 when caller belongs to a different organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "other-org-admin" });
    mockTicketFindUnique.mockResolvedValue(baseTicket);
    // Membership lookup is scoped to ticket's organizationId ('org-1'); returns null
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
  });

  it("successfully allows the ticket owner to access their own ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTicketFindUnique.mockResolvedValue(baseTicket);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(ticketId);
    expect(data.ticketNumber).toBe(42);
    expect(data.status).toBe("CALLED");
    expect(data.counter).toEqual({ id: "counter-1", name: "Desk 1" });
    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
  });

  it("successfully allows an ADMIN from the owning organization to access ticket details", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "admin-user" });
    mockTicketFindUnique.mockResolvedValue(baseTicket);
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(ticketId);
    expect(data.counter).toEqual({ id: "counter-1", name: "Desk 1" });
  });

  it("successfully allows a STAFF operator from the owning organization to access ticket details", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "staff-operator" });
    mockTicketFindUnique.mockResolvedValue(baseTicket);
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(ticketId);
    expect(data.counter).toEqual({ id: "counter-1", name: "Desk 1" });
  });

  it("returns counter as null when no counter has been assigned", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTicketFindUnique.mockResolvedValue({
      ...baseTicket,
      status: "WAITING",
      counter: null,
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe("WAITING");
    expect(data.counter).toBeNull();
  });

  it("successfully reads legacy tickets with null lifecycle timestamps", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTicketFindUnique.mockResolvedValue({
      ...baseTicket,
      status: "COMPLETED",
      calledAt: null,
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      cancelledAt: null,
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBe(ticketId);
    expect(data.status).toBe("COMPLETED");
    expect(data.estimatedWaitMinutes).toBeNull();
  });

  it("returns estimatedWaitMinutes as 0 for CALLED tickets", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTicketFindUnique.mockResolvedValue({
      ...baseTicket,
      status: "CALLED",
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.estimatedWaitMinutes).toBe(0);
  });

  it("returns estimatedWaitMinutes calculated from peopleAhead and historical service duration for WAITING tickets", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTicketFindUnique.mockResolvedValue({
      ...baseTicket,
      status: "WAITING",
    });
    mockTicketCount.mockResolvedValue(3); // 3 people ahead
    // Queue history: completed ticket took 6 minutes
    mockTicketFindMany.mockResolvedValue([
      {
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
        completedAt: new Date(Date.now() - 4 * 60 * 1000), // 6 minutes
      },
    ]);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    // 3 people ahead * 6 min = 18 min
    expect(data.estimatedWaitMinutes).toBe(18);
  });

  it("returns estimatedWaitMinutes as null when queue is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: ownerId });
    mockTicketFindUnique.mockResolvedValue({
      ...baseTicket,
      status: "WAITING",
      queue: {
        ...baseTicket.queue,
        isActive: false,
      },
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.estimatedWaitMinutes).toBeNull();
  });
});
