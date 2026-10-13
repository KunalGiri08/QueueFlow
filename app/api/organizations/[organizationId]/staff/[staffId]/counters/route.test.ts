import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockCounterFindFirst,
  mockCounterAssignmentCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockCounterFindFirst: vi.fn(),
  mockCounterAssignmentCreate: vi.fn(),
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
    },
    staffCounterAssignment: {
      create: mockCounterAssignmentCreate,
    },
  },
}));

import { POST } from "./route";

const organizationId = "org-1";
const targetStaffId = "user-target";
const counterId = "counter-1";

function createParams(
  overrides: { organizationId?: string; staffId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      staffId: overrides.staffId ?? targetStaffId,
    }),
  };
}

describe("POST /api/organizations/[organizationId]/staff/[staffId]/counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when a STAFF caller attempts to manage counter assignments", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can assign staff to counters",
    });
  });

  it("returns 404 when the target user is not a member of the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" }) // caller check
      .mockResolvedValueOnce(null); // target check

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Staff member does not belong to this organization",
    });
  });

  it("returns 404 when the counter does not belong to the organization or is inactive", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" });
    mockCounterFindFirst.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Counter is invalid or inactive",
    });
  });

  it("successfully assigns a STAFF member to a counter", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId });
    mockCounterAssignmentCreate.mockResolvedValue({
      id: "assign-1",
      userId: targetStaffId,
      counter: { id: counterId, name: "Counter 1" },
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "assign-1",
      staffId: targetStaffId,
      counter: { id: counterId, name: "Counter 1" },
    });
  });

  it("successfully assigns an ADMIN member to a counter", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "ADMIN" }); // target is ADMIN
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId });
    mockCounterAssignmentCreate.mockResolvedValue({
      id: "assign-2",
      userId: targetStaffId,
      counter: { id: counterId, name: "Counter 1" },
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "assign-2",
      staffId: targetStaffId,
      counter: { id: counterId, name: "Counter 1" },
    });
  });

  it("returns 500 without exposing internal error details on unexpected database failure", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "STAFF" });
    mockCounterFindFirst.mockResolvedValue({ id: counterId, organizationId });
    mockCounterAssignmentCreate.mockRejectedValue(
      new Error("FATAL: connection pool exhausted at postgresql://postgres:secret@db:5432"),
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterId }),
      }),
      createParams(),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(data)).not.toContain("connection pool exhausted");
    expect(JSON.stringify(data)).not.toContain("secret");
  });
});
