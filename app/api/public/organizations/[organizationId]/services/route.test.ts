import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOrganizationFindUnique, mockServiceFindMany } = vi.hoisted(() => ({
  mockOrganizationFindUnique: vi.fn(),
  mockServiceFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findUnique: mockOrganizationFindUnique,
    },
    service: {
      findMany: mockServiceFindMany,
    },
  },
}));

import { GET } from "./route";

const organizationId = "org-123";

function createParams(id: string = organizationId) {
  return {
    params: Promise.resolve({ organizationId: id }),
  };
}

describe("GET /api/public/organizations/[organizationId]/services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is publicly accessible without authentication", async () => {
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "Alpha Clinic",
      slug: "alpha-clinic",
    });
    mockServiceFindMany.mockResolvedValue([
      {
        id: "svc-1",
        name: "General Consultation",
        description: "Primary care services",
        queues: [{ id: "q-1", name: "Queue A", isActive: true }],
      },
    ]);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      organization: {
        id: organizationId,
        name: "Alpha Clinic",
        slug: "alpha-clinic",
      },
      services: [
        {
          id: "svc-1",
          name: "General Consultation",
          description: "Primary care services",
          queues: [{ id: "q-1", name: "Queue A", isActive: true }],
        },
      ],
    });
  });

  it("returns 404 when the organization does not exist", async () => {
    mockOrganizationFindUnique.mockResolvedValue(null);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Organization not found",
    });
    expect(mockOrganizationFindUnique).toHaveBeenCalledWith({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
    expect(mockServiceFindMany).not.toHaveBeenCalled();
  });

  it("returns correct response shape and performs explicit field selection without exposing sensitive data", async () => {
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "Metro Health",
      slug: "metro-health",
    });
    mockServiceFindMany.mockResolvedValue([
      {
        id: "svc-10",
        name: "Pediatrics",
        description: "Child health care",
        queues: [
          { id: "q-10", name: "Walk-ins", isActive: true },
        ],
      },
    ]);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();

    // Verify organization fields: only id, name, slug
    expect(Object.keys(body.organization)).toEqual(["id", "name", "slug"]);

    // Verify service fields: only id, name, description, queues
    expect(Object.keys(body.services[0])).toEqual([
      "id",
      "name",
      "description",
      "queues",
    ]);

    // Verify queue fields: only id, name, isActive (no nextTicketNumber, tickets, staff, appointments)
    expect(Object.keys(body.services[0].queues[0])).toEqual([
      "id",
      "name",
      "isActive",
    ]);

    // Check Prisma select clauses
    expect(mockOrganizationFindUnique).toHaveBeenCalledWith({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    expect(mockServiceFindMany).toHaveBeenCalledWith({
      where: {
        organizationId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        queues: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            isActive: true,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
  });

  it("orders services alphabetically by name", async () => {
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "City Hospital",
      slug: "city-hospital",
    });
    mockServiceFindMany.mockResolvedValue([
      {
        id: "svc-b",
        name: "Billing & Inquiries",
        description: "Finance desk",
        queues: [],
      },
      {
        id: "svc-d",
        name: "Dental Care",
        description: "Dental clinic",
        queues: [],
      },
      {
        id: "svc-x",
        name: "X-Ray & Radiology",
        description: "Imaging services",
        queues: [],
      },
    ]);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.services.map((s: { name: string }) => s.name)).toEqual([
      "Billing & Inquiries",
      "Dental Care",
      "X-Ray & Radiology",
    ]);

    expect(mockServiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          name: "asc",
        },
      }),
    );
  });

  it("excludes inactive queues via query filter", async () => {
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "City Hospital",
      slug: "city-hospital",
    });
    mockServiceFindMany.mockResolvedValue([
      {
        id: "svc-1",
        name: "Emergency",
        description: "ER triage",
        queues: [
          { id: "q-active-1", name: "Fast Track", isActive: true },
          { id: "q-active-2", name: "Trauma Bay", isActive: true },
        ],
      },
    ]);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();

    // Verify filter specification in Prisma query
    expect(mockServiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          queues: expect.objectContaining({
            where: {
              isActive: true,
            },
          }),
        }),
      }),
    );

    // Verify all returned queues have isActive: true
    expect(body.services[0].queues.every((q: { isActive: boolean }) => q.isActive)).toBe(true);
    expect(body.services[0].queues).toHaveLength(2);
  });

  it("retains services with an empty array when they have no active queues", async () => {
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "Specialty Clinic",
      slug: "specialty-clinic",
    });
    mockServiceFindMany.mockResolvedValue([
      {
        id: "svc-no-queues",
        name: "Cardiology Consultation",
        description: "Specialist consultation",
        queues: [],
      },
    ]);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.services).toHaveLength(1);
    expect(body.services[0].name).toBe("Cardiology Consultation");
    expect(body.services[0].queues).toEqual([]);
  });

  it("returns 200 with an empty services array when the organization has no services", async () => {
    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "Empty Org",
      slug: "empty-org",
    });
    mockServiceFindMany.mockResolvedValue([]);

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organization: {
        id: organizationId,
        name: "Empty Org",
        slug: "empty-org",
      },
      services: [],
    });
  });

  it("returns sanitized 500 when organization lookup fails unexpectedly", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockOrganizationFindUnique.mockRejectedValue(
      new Error(
        "FATAL: database connection lost at postgresql://postgres:supersecret@db:5432",
      ),
    );

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("supersecret");
    expect(JSON.stringify(body)).not.toContain("database connection lost");

    consoleErrorSpy.mockRestore();
  });

  it("returns sanitized 500 when service query fails unexpectedly", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockOrganizationFindUnique.mockResolvedValue({
      id: organizationId,
      name: "Alpha Clinic",
      slug: "alpha-clinic",
    });
    mockServiceFindMany.mockRejectedValue(
      new Error(
        "FATAL: query timeout executing select * from services at postgresql://postgres:supersecret@db:5432",
      ),
    );

    const request = new Request(
      `http://localhost/api/public/organizations/${organizationId}/services`,
    );
    const response = await GET(request, createParams());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: "Internal server error" });
    expect(JSON.stringify(body)).not.toContain("supersecret");
    expect(JSON.stringify(body)).not.toContain("query timeout");

    consoleErrorSpy.mockRestore();
  });
});
