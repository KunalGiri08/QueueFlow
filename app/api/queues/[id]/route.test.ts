import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQueueFindUnique, mockTicketFindFirst, mockTicketCount } = vi.hoisted(() => ({
  mockQueueFindUnique: vi.fn(),
  mockTicketFindFirst: vi.fn(),
  mockTicketCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    queue: {
      findUnique: mockQueueFindUnique,
    },
    ticket: {
      findFirst: mockTicketFindFirst,
      count: mockTicketCount,
    },
  },
}));

import { GET } from "./route";

const queueId = "queue-123";
const params = Promise.resolve({ id: queueId });

describe("GET /api/queues/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the queue is not found", async () => {
    mockQueueFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Queue not found" });
    expect(mockTicketFindFirst).not.toHaveBeenCalled();
    expect(mockTicketCount).not.toHaveBeenCalled();
  });

  it("returns currently serving ticket number and waiting count for today's tickets", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      service: {
        organization: {
          timezone: "Asia/Kolkata",
        },
      },
    });

    mockTicketFindFirst.mockResolvedValue({ number: 15 });
    mockTicketCount.mockResolvedValue(4);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: queueId,
      name: "Main Queue",
      isActive: true,
      currentlyServing: 15,
      waitingCount: 4,
    });

    expect(mockTicketFindFirst).toHaveBeenCalledWith({
      where: {
        queueId,
        status: "SERVING",
        createdAt: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      },
      orderBy: {
        number: "asc",
      },
      select: {
        number: true,
      },
    });

    expect(mockTicketCount).toHaveBeenCalledWith({
      where: {
        queueId,
        status: "WAITING",
        createdAt: {
          gte: expect.any(Date),
          lt: expect.any(Date),
        },
      },
    });
  });

  it("excludes stale waiting and serving tickets from prior calendar days on a dormant queue", async () => {
    mockQueueFindUnique.mockResolvedValue({
      id: queueId,
      name: "Dormant Queue",
      isActive: true,
      service: {
        organization: {
          timezone: "UTC",
        },
      },
    });

    // On a dormant queue, findFirst for today's SERVING returns null, count for today's WAITING returns 0
    mockTicketFindFirst.mockResolvedValue(null);
    mockTicketCount.mockResolvedValue(0);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: queueId,
      name: "Dormant Queue",
      isActive: true,
      currentlyServing: null,
      waitingCount: 0,
    });

    // Asserts that the bounds filter was applied to prevent yesterday's tickets from leaking
    expect(mockTicketFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );
    expect(mockTicketCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: expect.any(Date),
            lt: expect.any(Date),
          },
        }),
      }),
    );
  });
});
