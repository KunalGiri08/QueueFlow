import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockOrganizationFindMany } = vi.hoisted(() => ({
  mockOrganizationFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: {
      findMany: mockOrganizationFindMany,
    },
  },
}));

import { GET } from "./route";

describe("GET /api/public/organizations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is publicly accessible and returns organizations with default pagination", async () => {
    const mockOrgs = [
      { id: "org-1", name: "Alpha Clinic", slug: "alpha-clinic" },
      { id: "org-2", name: "Beta Bank", slug: "beta-bank" },
    ];
    mockOrganizationFindMany.mockResolvedValue(mockOrgs);

    const request = new Request("http://localhost/api/public/organizations");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizations: mockOrgs,
      pagination: {
        page: 1,
        limit: 20,
      },
    });

    expect(mockOrganizationFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
      skip: 0,
      take: 20,
    });
  });

  it("supports custom valid page and limit parameters", async () => {
    const mockOrgs = [
      { id: "org-3", name: "Gamma Services", slug: "gamma-services" },
    ];
    mockOrganizationFindMany.mockResolvedValue(mockOrgs);

    const request = new Request(
      "http://localhost/api/public/organizations?page=3&limit=10",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizations: mockOrgs,
      pagination: {
        page: 3,
        limit: 10,
      },
    });

    expect(mockOrganizationFindMany).toHaveBeenCalledWith({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
      skip: 20,
      take: 10,
    });
  });

  it("returns empty organizations array when no organizations exist", async () => {
    mockOrganizationFindMany.mockResolvedValue([]);

    const request = new Request("http://localhost/api/public/organizations");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      organizations: [],
      pagination: {
        page: 1,
        limit: 20,
      },
    });
  });

  it.each([
    ["zero limit", "limit=0"],
    ["negative limit", "limit=-5"],
    ["above maximum limit", "limit=51"],
    ["non-numeric limit", "limit=abc"],
    ["decimal limit", "limit=2.5"],
    ["empty limit", "limit="],
  ])("rejects invalid limit (%s) with 400", async (_, query) => {
    const request = new Request(
      `http://localhost/api/public/organizations?${query}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid limit" });
    expect(mockOrganizationFindMany).not.toHaveBeenCalled();
  });

  it.each([
    ["zero page", "page=0"],
    ["negative page", "page=-1"],
    ["non-numeric page", "page=xyz"],
    ["decimal page", "page=1.5"],
    ["empty page", "page="],
    ["exceeding safe integer", "page=9007199254740992"],
  ])("rejects invalid page (%s) with 400", async (_, query) => {
    const request = new Request(
      `http://localhost/api/public/organizations?${query}`,
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid page" });
    expect(mockOrganizationFindMany).not.toHaveBeenCalled();
  });

  it("returns sanitized 500 when database throws an unexpected error", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    mockOrganizationFindMany.mockRejectedValue(
      new Error("FATAL: database connection pool exhausted"),
    );

    const request = new Request("http://localhost/api/public/organizations");
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });

    consoleErrorSpy.mockRestore();
  });
});
