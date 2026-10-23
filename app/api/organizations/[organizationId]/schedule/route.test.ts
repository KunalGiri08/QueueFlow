import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockIntervalFindMany,
  mockIntervalCreate,
  mockTransaction,
  mockQueryRaw,
  mockTxIntervalFindMany,
  mockTxIntervalCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockIntervalFindMany: vi.fn(),
  mockIntervalCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxIntervalFindMany: vi.fn(),
  mockTxIntervalCreate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    organizationScheduleInterval: {
      findMany: mockIntervalFindMany,
      create: mockIntervalCreate,
    },
    $transaction: mockTransaction,
  },
}));

import { GET, POST } from "./route";

const organizationId = "org-1";

function createParams(overrides: { organizationId?: string } = {}) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
    }),
  };
}

describe("GET /api/organizations/[organizationId]/schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when user is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-outsider" });
    mockMembershipFindUnique.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "You are not a member of this organization",
    });
  });

  it("returns schedule intervals sorted for an authorized member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });
    const mockIntervals = [
      {
        id: "int-1",
        organizationId,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "13:00",
        isActive: true,
      },
      {
        id: "int-2",
        organizationId,
        dayOfWeek: 1,
        startTime: "14:00",
        endTime: "18:00",
        isActive: true,
      },
    ];
    mockIntervalFindMany.mockResolvedValue(mockIntervals);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(mockIntervals);
    expect(mockIntervalFindMany).toHaveBeenCalledWith({
      where: { organizationId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  });
});

describe("POST /api/organizations/[organizationId]/schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findMany: mockTxIntervalFindMany.mockResolvedValue([]),
          create: mockTxIntervalCreate,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an organization admin (STAFF caller)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can create schedule intervals",
    });
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it.each([
    { dayOfWeek: -1, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 7, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 1.5, startTime: "09:00", endTime: "17:00" },
    { dayOfWeek: 1, startTime: "9:00", endTime: "17:00" },
    { dayOfWeek: 1, startTime: "24:00", endTime: "17:00" },
    { dayOfWeek: 1, startTime: "09:60", endTime: "17:00" },
    { dayOfWeek: 1, startTime: "17:00", endTime: "09:00" },
    { dayOfWeek: 1, startTime: "10:00", endTime: "10:00" },
  ])("returns 400 when payload is invalid (%j)", async (payload) => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 409 when new active interval overlaps with an existing active interval", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findMany: mockTxIntervalFindMany.mockResolvedValue([
            { id: "existing-1", startTime: "09:00", endTime: "13:00" },
          ]),
          create: mockTxIntervalCreate,
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "12:00",
          endTime: "16:00",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Schedule interval overlaps with an existing active interval",
    });
  });

  it("allows touching boundary intervals (e.g. 09:00-12:00 and 12:00-16:00)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findMany: mockTxIntervalFindMany.mockResolvedValue([
            { id: "existing-1", startTime: "09:00", endTime: "12:00" },
          ]),
          create: mockTxIntervalCreate.mockResolvedValue({
            id: "new-int",
            organizationId,
            dayOfWeek: 1,
            startTime: "12:00",
            endTime: "16:00",
            isActive: true,
          }),
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "12:00",
          endTime: "16:00",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "new-int",
      organizationId,
      dayOfWeek: 1,
      startTime: "12:00",
      endTime: "16:00",
      isActive: true,
    });
  });

  it("permits overlapping times if the new interval is inactive (isActive: false)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findMany: mockTxIntervalFindMany,
          create: mockTxIntervalCreate.mockResolvedValue({
            id: "inactive-int",
            organizationId,
            dayOfWeek: 1,
            startTime: "10:00",
            endTime: "14:00",
            isActive: false,
          }),
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "14:00",
          isActive: false,
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    // When inactive, active intervals findMany should not even be queried
    expect(mockTxIntervalFindMany).not.toHaveBeenCalled();
  });

  it("verifies concurrency row lock is acquired on Organization before interval creation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    let lockAcquired = false;
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockImplementation(async () => {
          lockAcquired = true;
          return [{ id: organizationId }];
        }),
        organizationScheduleInterval: {
          findMany: mockTxIntervalFindMany.mockImplementation(async () => {
            expect(lockAcquired).toBe(true);
            return [];
          }),
          create: mockTxIntervalCreate.mockImplementation(async () => {
            expect(lockAcquired).toBe(true);
            return {
              id: "locked-int",
              organizationId,
              dayOfWeek: 2,
              startTime: "08:00",
              endTime: "12:00",
              isActive: true,
            };
          }),
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 2,
          startTime: "08:00",
          endTime: "12:00",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(lockAcquired).toBe(true);
  });

  it("returns 404 when organization is not found during transaction", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([]), // No org returned
        organizationScheduleInterval: {
          findMany: mockTxIntervalFindMany,
          create: mockTxIntervalCreate,
        },
      };
      return callback(tx);
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek: 1,
          startTime: "09:00",
          endTime: "17:00",
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Organization not found" });
  });
});
