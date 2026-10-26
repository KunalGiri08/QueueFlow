import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetCurrentUser, mockMembershipFindUnique, mockTicketFindFirst } =
  vi.hoisted(() => ({
    mockGetCurrentUser: vi.fn(),
    mockMembershipFindUnique: vi.fn(),
    mockTicketFindFirst: vi.fn(),
  }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    ticket: {
      findFirst: mockTicketFindFirst,
    },
  },
}));

import { GET } from "./route";

const organizationId = "org-1";
const staffId = "user-staff";
const counterId = "counter-1";
const queueId = "queue-1";
const serviceId = "service-1";

function createParams(
  overrides: { organizationId?: string; staffId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      staffId: overrides.staffId ?? staffId,
    }),
  };
}

describe("GET /api/organizations/[organizationId]/staff/[staffId]/active-ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
    });

    expect(mockMembershipFindUnique).not.toHaveBeenCalled();
    expect(mockTicketFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller is not an organization member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-outside" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not a member of this organization",
    });

    expect(mockTicketFindFirst).not.toHaveBeenCalled();
  });

  it("returns 403 when a STAFF caller attempts to view another staff member's active ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff-1" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await GET(
      new Request("http://localhost"),
      createParams({ staffId: "user-staff-2" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not allowed to view this staff member's active ticket",
    });

    expect(mockTicketFindFirst).not.toHaveBeenCalled();
  });

  it("returns 404 when the target staff member is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce(null); // target check

    const response = await GET(
      new Request("http://localhost"),
      createParams({ staffId: "target-not-member" }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Staff member does not belong to this organization",
    });

    expect(mockTicketFindFirst).not.toHaveBeenCalled();
  });

  it("successfully returns a CALLED active ticket for a STAFF caller retrieving their own ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    const mockActiveTicket = {
      id: "ticket-1",
      number: 42,
      status: "CALLED",
      queueId,
      counterId,
      createdAt: new Date("2026-10-17T10:00:00.000Z"),
      updatedAt: new Date("2026-10-17T10:05:00.000Z"),
      queue: {
        id: queueId,
        name: "Express Queue",
        service: {
          id: serviceId,
          name: "Express Service",
        },
      },
      counter: {
        id: counterId,
        name: "Desk 1",
      },
    };

    mockTicketFindFirst.mockResolvedValue(mockActiveTicket);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ticket: {
        id: "ticket-1",
        number: 42,
        status: "CALLED",
        queueId,
        counterId,
        createdAt: mockActiveTicket.createdAt.toISOString(),
        updatedAt: mockActiveTicket.updatedAt.toISOString(),
        queue: {
          id: queueId,
          name: "Express Queue",
          service: {
            id: serviceId,
            name: "Express Service",
          },
        },
        service: {
          id: serviceId,
          name: "Express Service",
        },
        counter: {
          id: counterId,
          name: "Desk 1",
        },
      },
    });

    expect(mockTicketFindFirst).toHaveBeenCalledWith({
      where: {
        servedById: staffId,
        status: { in: ["CALLED", "SERVING"] },
        queue: {
          service: {
            organizationId,
          },
        },
        createdAt: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      },
      include: {
        queue: {
          select: {
            id: true,
            name: true,
            service: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        counter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  });

  it("successfully returns a SERVING active ticket for a STAFF caller retrieving their own ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    const mockActiveTicket = {
      id: "ticket-2",
      number: 43,
      status: "SERVING",
      queueId,
      counterId,
      createdAt: new Date("2026-10-17T11:00:00.000Z"),
      updatedAt: new Date("2026-10-17T11:02:00.000Z"),
      queue: {
        id: queueId,
        name: "Main Queue",
        service: {
          id: serviceId,
          name: "General Inquiries",
        },
      },
      counter: {
        id: counterId,
        name: "Counter 2",
      },
    };

    mockTicketFindFirst.mockResolvedValue(mockActiveTicket);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ticket: {
        id: "ticket-2",
        number: 43,
        status: "SERVING",
        queueId,
        counterId,
        createdAt: mockActiveTicket.createdAt.toISOString(),
        updatedAt: mockActiveTicket.updatedAt.toISOString(),
        queue: {
          id: queueId,
          name: "Main Queue",
          service: {
            id: serviceId,
            name: "General Inquiries",
          },
        },
        service: {
          id: serviceId,
          name: "General Inquiries",
        },
        counter: {
          id: counterId,
          name: "Counter 2",
        },
      },
    });
  });

  it("successfully allows an ADMIN caller to inspect another staff member's active ticket", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce({ role: "STAFF" }); // target check

    const mockActiveTicket = {
      id: "ticket-3",
      number: 44,
      status: "CALLED",
      queueId,
      counterId,
      createdAt: new Date("2026-10-17T12:00:00.000Z"),
      updatedAt: new Date("2026-10-17T12:01:00.000Z"),
      queue: {
        id: queueId,
        name: "Priority Queue",
        service: {
          id: serviceId,
          name: "VIP Service",
        },
      },
      counter: {
        id: counterId,
        name: "Desk 3",
      },
    };

    mockTicketFindFirst.mockResolvedValue(mockActiveTicket);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ticket: {
        id: "ticket-3",
        number: 44,
        status: "CALLED",
        queueId,
        counterId,
        createdAt: mockActiveTicket.createdAt.toISOString(),
        updatedAt: mockActiveTicket.updatedAt.toISOString(),
        queue: {
          id: queueId,
          name: "Priority Queue",
          service: {
            id: serviceId,
            name: "VIP Service",
          },
        },
        service: {
          id: serviceId,
          name: "VIP Service",
        },
        counter: {
          id: counterId,
          name: "Desk 3",
        },
      },
    });
  });

  it("returns { ticket: null } with status 200 when no active ticket exists", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockTicketFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ticket: null,
    });
  });

  it("enforces organization isolation by querying tickets matching queue.service.organizationId", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockTicketFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams({ organizationId: "org-isolated" }),
    );

    expect(response.status).toBe(200);
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          servedById: staffId,
          status: { in: ["CALLED", "SERVING"] },
          queue: {
            service: {
              organizationId: "org-isolated",
            },
          },
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        },
      }),
    );
  });

  it("does not expose customer email or unnecessary personal information", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    const mockActiveTicket = {
      id: "ticket-4",
      number: 45,
      status: "SERVING",
      queueId,
      counterId,
      createdAt: new Date("2026-10-17T13:00:00.000Z"),
      updatedAt: new Date("2026-10-17T13:05:00.000Z"),
      queue: {
        id: queueId,
        name: "Support Queue",
        service: {
          id: serviceId,
          name: "Customer Support",
        },
      },
      counter: {
        id: counterId,
        name: "Counter 4",
      },
    };

    mockTicketFindFirst.mockResolvedValue(mockActiveTicket);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ticket).toBeDefined();
    expect(data.ticket).not.toHaveProperty("user");
    expect(data.ticket).not.toHaveProperty("email");
    expect(data.ticket).not.toHaveProperty("customerEmail");
    expect(data.ticket).not.toHaveProperty("userId");
    expect(data.ticket).not.toHaveProperty("trackingToken");
  });

  it("returns 500 without exposing internal error details on unexpected database failure", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "STAFF" })
      .mockResolvedValueOnce({ role: "STAFF" });

    mockTicketFindFirst.mockRejectedValue(
      new Error("FATAL: connection pool exhausted at postgresql://postgres:secret@db:5432"),
    );

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(data)).not.toContain("connection pool exhausted");
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("does not return a stale active ticket from a previous calendar day on a dormant queue", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: staffId });
    mockMembershipFindUnique
      .mockResolvedValueOnce({
        role: "STAFF",
        organization: { timezone: "Asia/Kolkata" },
      })
      .mockResolvedValueOnce({
        role: "STAFF",
        organization: { timezone: "Asia/Kolkata" },
      });

    mockTicketFindFirst.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ticket: null });
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );
  });
});
