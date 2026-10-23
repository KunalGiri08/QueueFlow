import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockIntervalFindFirst,
  mockIntervalDelete,
  mockTransaction,
  mockQueryRaw,
  mockTxIntervalFindFirst,
  mockTxIntervalFindMany,
  mockTxIntervalUpdate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockIntervalFindFirst: vi.fn(),
  mockIntervalDelete: vi.fn(),
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxIntervalFindFirst: vi.fn(),
  mockTxIntervalFindMany: vi.fn(),
  mockTxIntervalUpdate: vi.fn(),
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
      findFirst: mockIntervalFindFirst,
      delete: mockIntervalDelete,
    },
    $transaction: mockTransaction,
  },
}));

import { PATCH, DELETE } from "./route";

const organizationId = "org-1";
const intervalId = "int-1";

function createParams(
  overrides: { organizationId?: string; intervalId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      intervalId: overrides.intervalId ?? intervalId,
    }),
  };
}

describe("PATCH /api/organizations/[organizationId]/schedule/[intervalId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findFirst: mockTxIntervalFindFirst.mockResolvedValue({
            id: intervalId,
            organizationId,
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "17:00",
            isActive: true,
          }),
          findMany: mockTxIntervalFindMany.mockResolvedValue([]),
          update: mockTxIntervalUpdate,
        },
      };
      return callback(tx);
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: "10:00" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an admin (STAFF caller)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: "10:00" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can update schedule intervals",
    });
  });

  it("returns 400 when no fields are provided in update body", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "At least one field must be provided to update",
    });
  });

  it("returns 404 when interval does not exist or belongs to another organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findFirst: mockTxIntervalFindFirst.mockResolvedValue(null), // not found in this org
          findMany: mockTxIntervalFindMany,
          update: mockTxIntervalUpdate,
        },
      };
      return callback(tx);
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: "10:00" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Schedule interval not found in this organization",
    });
  });

  it("returns 400 when updated startTime causes startTime >= existing endTime", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    // Existing interval is 09:00 to 17:00
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: "18:00" }), // 18:00 > 17:00
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "startTime must be earlier than endTime",
    });
  });

  it("returns 409 when updated interval overlaps with another active interval on the same day", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findFirst: mockTxIntervalFindFirst.mockResolvedValue({
            id: intervalId,
            organizationId,
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "13:00",
            isActive: true,
          }),
          findMany: mockTxIntervalFindMany.mockResolvedValue([
            { id: "other-int", startTime: "14:00", endTime: "18:00" },
          ]),
          update: mockTxIntervalUpdate,
        },
      };
      return callback(tx);
    });

    // Updating to 13:00 - 16:00 will overlap with other-int (14:00 - 18:00)
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startTime: "13:00", endTime: "16:00" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Schedule interval overlaps with an existing active interval",
    });
  });

  it("successfully updates interval when touching boundary without overlap", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findFirst: mockTxIntervalFindFirst.mockResolvedValue({
            id: intervalId,
            organizationId,
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "13:00",
            isActive: true,
          }),
          findMany: mockTxIntervalFindMany.mockResolvedValue([
            { id: "other-int", startTime: "14:00", endTime: "18:00" },
          ]),
          update: mockTxIntervalUpdate.mockResolvedValue({
            id: intervalId,
            organizationId,
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "14:00",
            isActive: true,
          }),
        },
      };
      return callback(tx);
    });

    // 09:00 to 14:00 touches 14:00 to 18:00
    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endTime: "14:00" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: intervalId,
      organizationId,
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "14:00",
      isActive: true,
    });
  });

  it("successfully deactivates an interval (isActive: false)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw.mockResolvedValue([{ id: organizationId }]),
        organizationScheduleInterval: {
          findFirst: mockTxIntervalFindFirst.mockResolvedValue({
            id: intervalId,
            organizationId,
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "17:00",
            isActive: true,
          }),
          findMany: mockTxIntervalFindMany,
          update: mockTxIntervalUpdate.mockResolvedValue({
            id: intervalId,
            organizationId,
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "17:00",
            isActive: false,
          }),
        },
      };
      return callback(tx);
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.isActive).toBe(false);
  });
});

describe("DELETE /api/organizations/[organizationId]/schedule/[intervalId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an admin", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when interval belongs to another organization (cross-tenant safety)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockIntervalFindFirst.mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Schedule interval not found in this organization",
    });
    expect(mockIntervalDelete).not.toHaveBeenCalled();
  });

  it("returns 204 when interval is successfully deleted", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockIntervalFindFirst.mockResolvedValue({ id: intervalId });
    mockIntervalDelete.mockResolvedValue({ id: intervalId });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      createParams(),
    );

    expect(response.status).toBe(204);
    expect(mockIntervalDelete).toHaveBeenCalledWith({
      where: { id: intervalId },
    });
  });
});
