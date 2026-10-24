import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockServiceFindFirst,
  mockQueueFindMany,
  mockQueueCreate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockServiceFindFirst: vi.fn(),
  mockQueueFindMany: vi.fn(),
  mockQueueCreate: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mockGetCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organizationMembership: {
      findUnique: mockMembershipFindUnique,
    },
    service: {
      findFirst: mockServiceFindFirst,
    },
    queue: {
      findMany: mockQueueFindMany,
      create: mockQueueCreate,
    },
  },
}));

import { GET, POST } from "./route";

const organizationId = "org-1";
const serviceId = "svc-1";

function createParams(
  overrides: { organizationId?: string; serviceId?: string } = {},
) {
  return {
    params: Promise.resolve({
      organizationId: overrides.organizationId ?? organizationId,
      serviceId: overrides.serviceId ?? serviceId,
    }),
  };
}

describe("POST /api/organizations/[organizationId]/services/[serviceId]/queues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when the user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Queue" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(401);
  });

  it("returns 403 when a STAFF caller attempts to create queues", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-staff" });
    mockMembershipFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Queue" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only organization admins can create queues",
    });
  });

  it("returns 404 when the service does not belong to the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Queue" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Service not found",
    });
  });

  it("returns 409 when the queue already exists (P2002 error)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({ id: serviceId, organizationId });

    const prismaUniqueError = new Error("Unique constraint violation");
    (prismaUniqueError as unknown as { code: string }).code = "P2002";
    mockQueueCreate.mockRejectedValue(prismaUniqueError);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Queue" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Queue with this name already exists",
    });
  });

  it("returns 500 without exposing internal error details on unexpected database failure", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({ id: serviceId, organizationId });

    const fatalDbError = new Error(
      "FATAL: database query failed at postgresql://postgres:secret@db:5432",
    );
    mockQueueCreate.mockRejectedValue(fatalDbError);

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Queue" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(data)).not.toContain("database query failed");
    expect(JSON.stringify(data)).not.toContain("secret");
  });

  it("successfully creates a queue", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({ id: serviceId, organizationId });
    mockQueueCreate.mockResolvedValue({
      id: "queue-1",
      name: "General Queue",
      serviceId,
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "General Queue" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: "queue-1",
      name: "General Queue",
      serviceId,
      isActive: true,
    });
  });

  it("supports configuring maxWaitingTickets and maxDailyTickets during queue creation", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({ id: serviceId, organizationId });
    mockQueueCreate.mockResolvedValue({
      id: "queue-2",
      name: "Capacity Controlled Queue",
      serviceId,
      maxWaitingTickets: 50,
      maxDailyTickets: 200,
      isActive: true,
    });

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Capacity Controlled Queue",
          maxWaitingTickets: 50,
          maxDailyTickets: 200,
        }),
      }),
      createParams(),
    );

    expect(response.status).toBe(201);
    expect(mockQueueCreate).toHaveBeenCalledWith({
      data: {
        name: "Capacity Controlled Queue",
        serviceId,
        maxWaitingTickets: 50,
        maxDailyTickets: 200,
      },
    });
  });
});

describe("GET /api/organizations/[organizationId]/services/[serviceId]/queues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when service does not belong to organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockServiceFindFirst.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Service not found" });
  });

  it("returns all queues (including inactive) for organization ADMIN callers", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockServiceFindFirst.mockResolvedValue({ id: serviceId, organizationId });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const allQueues = [
      { id: "q-1", name: "Queue 1", serviceId, isActive: true },
      { id: "q-2", name: "Queue 2", serviceId, isActive: false },
    ];
    mockQueueFindMany.mockResolvedValue(allQueues);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(allQueues);
    expect(mockQueueFindMany).toHaveBeenCalledWith({
      where: {
        serviceId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  });

  it("returns only active queues for non-admin callers", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-customer" });
    mockServiceFindFirst.mockResolvedValue({ id: serviceId, organizationId });
    mockMembershipFindUnique.mockResolvedValue(null);

    const activeQueues = [
      { id: "q-1", name: "Queue 1", serviceId, isActive: true },
    ];
    mockQueueFindMany.mockResolvedValue(activeQueues);

    const response = await GET(
      new Request("http://localhost"),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(activeQueues);
    expect(mockQueueFindMany).toHaveBeenCalledWith({
      where: {
        serviceId,
        isActive: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  });
});
