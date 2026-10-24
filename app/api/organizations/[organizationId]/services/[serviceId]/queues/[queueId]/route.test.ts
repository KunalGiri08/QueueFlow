import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockQueueFindFirst,
  mockQueueUpdate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockQueueFindFirst: vi.fn(),
  mockQueueUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    queue: {
      findFirst: mockQueueFindFirst,
      update: mockQueueUpdate,
    },
  },
}));

import { PATCH } from "./route";

const organizationId = "org-1";
const serviceId = "srv-1";
const queueId = "queue-1";

function createParams(
  overrides: {
    organizationId?: string;
    serviceId?: string;
    queueId?: string;
  } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      serviceId: overrides.serviceId ?? serviceId,
      queueId: overrides.queueId ?? queueId,
    }),
  };
}

describe("PATCH /api/organizations/[organizationId]/services/[serviceId]/queues/[queueId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 403 when a non-ADMIN attempts to update queue status", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can update queues",
    });
  });

  it("returns 400 when request body is invalid JSON", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "invalid-json",
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when request body fails validation (empty payload)", async () => {
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
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 404 when queue is not found for this service and organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Queue not found" });
    expect(mockQueueFindFirst).toHaveBeenCalledWith({
      where: {
        id: queueId,
        serviceId,
        service: {
          organizationId,
        },
      },
    });
  });

  it("successfully deactivates an active queue", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
    });
    mockQueueUpdate.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: false,
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
    expect(await response.json()).toEqual({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: false,
    });
    expect(mockQueueUpdate).toHaveBeenCalledWith({
      where: { id: queueId },
      data: { isActive: false },
    });
  });

  it("successfully activates an inactive queue", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: false,
    });
    mockQueueUpdate.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
    });
    expect(mockQueueUpdate).toHaveBeenCalledWith({
      where: { id: queueId },
      data: { isActive: true },
    });
  });

  it("returns 409 when renaming to a name that already exists (P2002)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
    });

    const p2002Error = new Error("Unique constraint violation");
    (p2002Error as unknown as { code: string }).code = "P2002";
    mockQueueUpdate.mockRejectedValue(p2002Error);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Existing Line" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "A queue with this name already exists for this service",
    });
  });

  it("returns 500 when database update throws an unexpected error", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
    });
    mockQueueUpdate.mockRejectedValue(new Error("Database connection lost"));

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });

  it("successfully updates maxWaitingTickets and maxDailyTickets", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
      maxWaitingTickets: 10,
      maxDailyTickets: 100,
    });
    mockQueueUpdate.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
      maxWaitingTickets: 30,
      maxDailyTickets: 250,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxWaitingTickets: 30,
          maxDailyTickets: 250,
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(mockQueueUpdate).toHaveBeenCalledWith({
      where: { id: queueId },
      data: {
        maxWaitingTickets: 30,
        maxDailyTickets: 250,
      },
    });
  });

  it("successfully clears maxWaitingTickets and maxDailyTickets to null", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockQueueFindFirst.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
      maxWaitingTickets: 30,
      maxDailyTickets: 250,
    });
    mockQueueUpdate.mockResolvedValue({
      id: queueId,
      name: "Line 1",
      serviceId,
      isActive: true,
      maxWaitingTickets: null,
      maxDailyTickets: null,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxWaitingTickets: null,
          maxDailyTickets: null,
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(mockQueueUpdate).toHaveBeenCalledWith({
      where: { id: queueId },
      data: {
        maxWaitingTickets: null,
        maxDailyTickets: null,
      },
    });
  });

  it("rejects updating with invalid capacity limit values (< 1)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxWaitingTickets: 0,
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
    expect(mockQueueUpdate).not.toHaveBeenCalled();
  });
});
