import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockCounterFindFirst,
  mockTicketFindFirst,
  mockCounterUpdate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockCounterFindFirst: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockCounterUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    counter: {
      findFirst: mockCounterFindFirst,
      update: mockCounterUpdate,
    },
    ticket: {
      findFirst: mockTicketFindFirst,
    },
  },
}));

import { PATCH } from "./route";

const organizationId = "org-1";
const counterId = "counter-1";

function createParams(
  overrides: { organizationId?: string; counterId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      counterId: overrides.counterId ?? counterId,
    }),
  };
}

describe("PATCH /api/organizations/[organizationId]/counters/[counterId]", () => {
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

  it("returns 403 when a STAFF caller attempts to update counter status", async () => {
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
      error: "Only organization admins can update counters",
    });
  });

  it("returns 400 when the request body is not valid JSON", async () => {
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

  it("returns 400 when the body fails schema validation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: "not-a-boolean" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Invalid request body");
  });

  it("returns 404 when the counter is not found in the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Counter not found in this organization",
    });
  });

  it("returns 409 when attempting to deactivate a counter with an active ticket in progress", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({
      id: counterId,
      organizationId,
      name: "Counter 1",
      isActive: true,
    });
    mockTicketFindFirst.mockResolvedValue({
      id: "ticket-active-1",
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Cannot deactivate counter while it has an active ticket",
    });
    expect(mockCounterUpdate).not.toHaveBeenCalled();
  });

  it("successfully deactivates counter when no active ticket is in progress", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({
      id: counterId,
      organizationId,
      name: "Counter 1",
      isActive: true,
    });
    mockTicketFindFirst.mockResolvedValue(null);
    mockCounterUpdate.mockResolvedValue({
      id: counterId,
      organizationId,
      name: "Counter 1",
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
      id: counterId,
      organizationId,
      name: "Counter 1",
      isActive: false,
    });
    expect(mockCounterUpdate).toHaveBeenCalledWith({
      where: { id: counterId },
      data: { isActive: false },
    });
  });

  it("successfully activates an inactive counter without needing active ticket checks", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({
      id: counterId,
      organizationId,
      name: "Counter 1",
      isActive: false,
    });
    mockCounterUpdate.mockResolvedValue({
      id: counterId,
      organizationId,
      name: "Counter 1",
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
      id: counterId,
      organizationId,
      name: "Counter 1",
      isActive: true,
    });
    expect(mockTicketFindFirst).not.toHaveBeenCalled();
    expect(mockCounterUpdate).toHaveBeenCalledWith({
      where: { id: counterId },
      data: { isActive: true },
    });
  });

  it("returns 500 when database update fails", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterFindFirst.mockResolvedValue({
      id: counterId,
      organizationId,
      name: "Counter 1",
      isActive: false,
    });
    mockCounterUpdate.mockRejectedValue(new Error("Database write error"));

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
      createParams(),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
