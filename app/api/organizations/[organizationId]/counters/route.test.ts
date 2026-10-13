import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockCounterFindMany,
  mockCounterCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockCounterFindMany: vi.fn(),
  mockCounterCreate: vi.fn(),
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
      findMany: mockCounterFindMany,
      create: mockCounterCreate,
    },
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

describe("POST /api/organizations/[organizationId]/counters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Counter 1" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when a STAFF caller attempts to create counters", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Counter 1" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can create counters",
    });
  });

  it("returns 409 when the counter already exists (P2002 error)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const prismaUniqueError = new Error("Unique constraint violation");
    (prismaUniqueError as unknown as { code: string }).code = "P2002";
    mockCounterCreate.mockRejectedValue(prismaUniqueError);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Counter 1" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Counter with this name already exists",
    });
  });

  it("returns 500 without exposing internal error details on unexpected database failure", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const fatalDbError = new Error(
      "FATAL: password authentication failed for user 'postgres' at connection postgresql://db:5432",
    );
    mockCounterCreate.mockRejectedValue(fatalDbError);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Counter 1" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(data)).not.toContain("password authentication failed");
    expect(JSON.stringify(data)).not.toContain("postgres");
  });

  it("successfully creates a counter", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockCounterCreate.mockResolvedValue({
      id: "counter-1",
      name: "Counter 1",
      organizationId,
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Counter 1" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "counter-1",
      name: "Counter 1",
      organizationId,
      isActive: true,
    });
  });
});
