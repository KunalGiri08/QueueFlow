import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetCurrentUser,
  mockMembershipFindUnique,
  mockServiceFindFirst,
  mockServiceUpdate,
} = vi.hoisted(() => ({
  mockGetCurrentUser: vi.fn(),
  mockMembershipFindUnique: vi.fn(),
  mockServiceFindFirst: vi.fn(),
  mockServiceUpdate: vi.fn(),
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
      update: mockServiceUpdate,
    },
  },
}));

import { PATCH } from "./route";

const organizationId = "org-1";
const serviceId = "service-1";

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

describe("PATCH /api/organizations/[organizationId]/services/[serviceId]", () => {
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

  it("returns 403 when a STAFF caller attempts to update service status", async () => {
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
      error: "Only organization admins can update services",
    });
  });

  it("returns 403 when caller is not an organization member", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-nonmember" });
    mockMembershipFindUnique.mockResolvedValue(null);

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
      error: "Only organization admins can update services",
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

  it("returns 400 when the request payload is empty", async () => {
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
    const json = await response.json();
    expect(json.error).toBe("Invalid request body");
  });

  it("returns 404 when the service does not exist in the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue(null);

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
      error: "Service not found in this organization",
    });
  });

  it("successfully deactivates an active service", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      description: "Consultations",
      organizationId,
      isActive: true,
    });
    mockServiceUpdate.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      description: "Consultations",
      organizationId,
      isActive: false,
      updatedAt: new Date().toISOString(),
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
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: serviceId },
      data: { isActive: false },
    });
  });

  it("successfully activates an inactive service", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      description: "Consultations",
      organizationId,
      isActive: false,
    });
    mockServiceUpdate.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      description: "Consultations",
      organizationId,
      isActive: true,
      updatedAt: new Date().toISOString(),
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
    const data = await response.json();
    expect(data.isActive).toBe(true);
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: serviceId },
      data: { isActive: true },
    });
  });

  it("returns 409 when renaming to a name that already exists in the organization", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
    });
    const prismaError = new Error("Unique constraint failed");
    (prismaError as unknown as { code: string }).code = "P2002";
    mockServiceUpdate.mockRejectedValue(prismaError);

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Pharmacy" }),
      }),
      createParams(),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "A service with this name already exists in this organization",
    });
  });

  it("returns 404 when database update throws P2025 record not found", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
    });
    const prismaError = new Error("Record not found");
    (prismaError as unknown as { code: string }).code = "P2025";
    mockServiceUpdate.mockRejectedValue(prismaError);

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
      error: "Service not found in this organization",
    });
  });

  it("returns 500 when database update throws an unexpected error", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
    });
    mockServiceUpdate.mockRejectedValue(new Error("Connection reset"));

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

  it("successfully updates admissionCutoffMinutes", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
      admissionCutoffMinutes: 15,
    });
    mockServiceUpdate.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
      admissionCutoffMinutes: 45,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admissionCutoffMinutes: 45 }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: serviceId },
      data: {
        admissionCutoffMinutes: 45,
      },
    });
    const body = await response.json();
    expect(body.admissionCutoffMinutes).toBe(45);
  });

  it("successfully resets admissionCutoffMinutes to null", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });
    mockServiceFindFirst.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
      admissionCutoffMinutes: 45,
    });
    mockServiceUpdate.mockResolvedValue({
      id: serviceId,
      name: "General Consultation",
      organizationId,
      isActive: true,
      admissionCutoffMinutes: null,
    });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admissionCutoffMinutes: null }),
      }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      where: { id: serviceId },
      data: {
        admissionCutoffMinutes: null,
      },
    });
  });

  it("rejects updating admissionCutoffMinutes with invalid value (< 0 or > 480)", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-admin" });
    mockMembershipFindUnique.mockResolvedValue({ role: "ADMIN" });

    const response = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ admissionCutoffMinutes: -5 }),
      }),
      createParams(),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid request body");
    expect(body.details.fieldErrors.admissionCutoffMinutes).toBeDefined();
    expect(mockServiceUpdate).not.toHaveBeenCalled();
  });
});
