import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockOrganizationFindUnique,
  mockMembershipFindUnique,
  mockServiceFindMany,
  mockServiceCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockOrganizationFindUnique: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockServiceFindMany: vi.fn(),
  mockServiceCreate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: mockOrganizationFindUnique,
    },
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    service: {
      findMany: mockServiceFindMany,
      create: mockServiceCreate,
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

describe("POST /api/organizations/[organizationId]/services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Service A" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when a STAFF caller attempts to create services", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Service A" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can create services",
    });
  });

  it("returns 409 when the service already exists (P2002 error)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const prismaUniqueError = new Error("Unique constraint violation");
    (prismaUniqueError as unknown as { code: string }).code = "P2002";
    mockServiceCreate.mockRejectedValue(prismaUniqueError);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Service A" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Service with this name already exists",
    });
  });

  it("returns 500 without exposing internal error details on unexpected database failure", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const fatalDbError = new Error(
      "FATAL: database disk full on host postgresql://postgres:secret@db:5432",
    );
    mockServiceCreate.mockRejectedValue(fatalDbError);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Service A" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(data)).not.toContain("database disk full");
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("successfully creates a service", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceCreate.mockResolvedValue({
      id: "service-1",
      name: "Service A",
      description: null,
      organizationId,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Service A" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "service-1",
      name: "Service A",
      description: null,
      organizationId,
    });
  });
});
