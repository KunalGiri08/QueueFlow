import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockOrganizationFindUnique,
  mockTicketCount,
  mockTicketFindMany,
  mockGetLocalCalendarDayBounds,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockOrganizationFindUnique: vi.fn(),
  mockTicketCount: vi.fn(),
  mockTicketFindMany: vi.fn(),
  mockGetLocalCalendarDayBounds: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    organization: {
      findUnique: mockOrganizationFindUnique,
    },
    ticket: {
      count: mockTicketCount,
      findMany: mockTicketFindMany,
    },
  },
}));

vi.mock("@/lib/services/ticket.service", () => ({
  getLocalCalendarDayBounds: mockGetLocalCalendarDayBounds,
}));

import { GET } from "./route";

const organizationId = "org-123";

function createParams(orgId = organizationId) {
  return {
    params: Promise.resolve({
      organizationId: orgId,
    }),
  };
}

describe("GET /api/organizations/[organizationId]/analytics", () => {
  const mockBounds = {
    start: new Date("2026-10-24T00:00:00.000Z"),
    end: new Date("2026-10-25T00:00:00.000Z"),
    dateStr: "2026-10-24",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalCalendarDayBounds.mockReturnValue(mockBounds);
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      timezone: "America/New_York",
    });
  });

  it("returns 401 when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when the caller is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-1" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/Administrator access required/i);
  });

  it("returns 403 when the caller has STAFF role instead of ADMIN", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toMatch(/Administrator access required/i);
  });

  it("returns 404 when the organization is not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockOrganizationFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("Organization not found");
  });

  it("returns 500 when calendar day bounds cannot be determined", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockGetLocalCalendarDayBounds.mockReturnValue(null);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toMatch(/Failed to determine calendar day bounds/i);
  });

  it("scopes all queries strictly to the requested organization and uses correct event timestamps", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    // Mock count calls sequentially:
    // 1: totalCreatedToday, 2: completedToday, 3: skippedToday, 4: cancelledToday,
    // 5: currentlyWaiting, 6: currentlyServing
    mockTicketCount
      .mockResolvedValueOnce(50) // created
      .mockResolvedValueOnce(35) // completed
      .mockResolvedValueOnce(3)  // skipped
      .mockResolvedValueOnce(2)  // cancelled
      .mockResolvedValueOnce(8)  // waiting
      .mockResolvedValueOnce(2); // serving

    // Mock called tickets for average actual wait calculation:
    // Ticket 1: waited 10 minutes (600,000 ms)
    // Ticket 2: waited 20 minutes (1,200,000 ms)
    mockTicketFindMany.mockResolvedValueOnce([
      {
        createdAt: new Date("2026-10-24T10:00:00.000Z"),
        calledAt: new Date("2026-10-24T10:10:00.000Z"),
      },
      {
        createdAt: new Date("2026-10-24T11:00:00.000Z"),
        calledAt: new Date("2026-10-24T11:20:00.000Z"),
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams("org-123"),
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual({
      date: "2026-10-24",
      timezone: "America/New_York",
      totalCreatedToday: 50,
      completedToday: 35,
      currentlyWaiting: 8,
      currentlyServing: 2,
      averageWaitMinutes: 15, // (10 + 20) / 2 = 15.0
      skippedToday: 3,
      cancelledToday: 2,
    });

    // Check timezone utility call
    expect(mockGetLocalCalendarDayBounds).toHaveBeenCalledWith(
      expect.any(Date),
      "America/New_York",
    );

    const expectedOrgFilter = {
      queue: {
        service: {
          organizationId: "org-123",
        },
      },
    };

    // Verify 1: Total created today uses createdAt
    expect(mockTicketCount).toHaveBeenNthCalledWith(1, {
      where: {
        ...expectedOrgFilter,
        createdAt: {
          gte: mockBounds.start,
          lt: mockBounds.end,
        },
      },
    });

    // Verify 2: Completed today uses completedAt
    expect(mockTicketCount).toHaveBeenNthCalledWith(2, {
      where: {
        ...expectedOrgFilter,
        completedAt: {
          gte: mockBounds.start,
          lt: mockBounds.end,
        },
      },
    });

    // Verify 3: Skipped today uses skippedAt
    expect(mockTicketCount).toHaveBeenNthCalledWith(3, {
      where: {
        ...expectedOrgFilter,
        skippedAt: {
          gte: mockBounds.start,
          lt: mockBounds.end,
        },
      },
    });

    // Verify 4: Cancelled today uses cancelledAt
    expect(mockTicketCount).toHaveBeenNthCalledWith(4, {
      where: {
        ...expectedOrgFilter,
        cancelledAt: {
          gte: mockBounds.start,
          lt: mockBounds.end,
        },
      },
    });

    // Verify 5: Currently waiting uses status: WAITING
    expect(mockTicketCount).toHaveBeenNthCalledWith(5, {
      where: {
        ...expectedOrgFilter,
        status: "WAITING",
      },
    });

    // Verify 6: Currently serving uses status: SERVING
    expect(mockTicketCount).toHaveBeenNthCalledWith(6, {
      where: {
        ...expectedOrgFilter,
        status: "SERVING",
      },
    });

    // Verify 7: Called tickets queries calledAt within bounds
    expect(mockTicketFindMany).toHaveBeenCalledWith({
      where: {
        ...expectedOrgFilter,
        calledAt: {
          gte: mockBounds.start,
          lt: mockBounds.end,
        },
      },
      select: {
        createdAt: true,
        calledAt: true,
      },
    });
  });

  it("returns null for averageWaitMinutes when no tickets have been called today", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTicketCount.mockResolvedValue(0);
    mockTicketFindMany.mockResolvedValueOnce([]);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.averageWaitMinutes).toBeNull();
  });

  it("ignores corrupted tickets where calledAt is before createdAt when calculating average wait", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTicketCount.mockResolvedValue(0);
    mockTicketFindMany.mockResolvedValueOnce([
      {
        // Valid: 6 minutes wait
        createdAt: new Date("2026-10-24T10:00:00.000Z"),
        calledAt: new Date("2026-10-24T10:06:00.000Z"),
      },
      {
        // Invalid: called before created
        createdAt: new Date("2026-10-24T10:30:00.000Z"),
        calledAt: new Date("2026-10-24T10:20:00.000Z"),
      },
      {
        // Invalid: missing calledAt
        createdAt: new Date("2026-10-24T10:00:00.000Z"),
        calledAt: null,
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.averageWaitMinutes).toBe(6);
  });

  it("returns generic 500 without exposing internal errors when database fails", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockTicketCount.mockRejectedValueOnce(new Error("FATAL: connection terminated unexpectedly"));

    const response = await GET(
      new Request("http://localhost/api/organizations/org-123/analytics"),
      createParams(),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to load analytics data");
    expect(JSON.stringify(data)).not.toContain("FATAL: connection terminated");
  });
});
