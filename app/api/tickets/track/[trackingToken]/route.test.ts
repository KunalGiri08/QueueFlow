import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTicketFindUnique, mockTicketCount, mockTicketFindFirst } =
  vi.hoisted(() => ({
    mockTicketFindUnique: vi.fn(),
    mockTicketCount: vi.fn(),
    mockTicketFindFirst: vi.fn(),
  }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      findUnique: mockTicketFindUnique,
      count: mockTicketCount,
      findFirst: mockTicketFindFirst,
    },
  },
}));

import { GET } from "./route";

const trackingToken = "5f2d4e8a1b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e";
const params = Promise.resolve({ trackingToken });

describe("GET /api/tickets/track/[trackingToken]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketCount.mockResolvedValue(2);
    mockTicketFindFirst.mockResolvedValue({ number: 40 });
  });

  it("returns 404 when the tracking token is not found", async () => {
    mockTicketFindUnique.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ticket not found" });
  });

  it("returns public tracking information with counter name when assigned", async () => {
    mockTicketFindUnique.mockResolvedValue({
      id: "internal-ticket-id",
      number: 42,
      status: "CALLED",
      userId: "internal-user-id",
      servedById: "internal-staff-id",
      queue: {
        name: "General Queue",
        service: {
          name: "Consultation",
          organization: {
            name: "Metro Health",
          },
        },
      },
      counter: {
        name: "Counter 3",
      },
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data).toEqual({
      ticketNumber: 42,
      status: "CALLED",
      peopleAhead: 2,
      currentlyServing: 40,
      queue: { name: "General Queue" },
      service: { name: "Consultation" },
      organization: { name: "Metro Health" },
      counter: { name: "Counter 3" },
    });

    // Explicitly verify no internal IDs or customer PII are leaked
    expect(data.id).toBeUndefined();
    expect(data.userId).toBeUndefined();
    expect(data.servedById).toBeUndefined();
    expect(data.counterId).toBeUndefined();
  });

  it("returns counter as null when no counter is assigned", async () => {
    mockTicketFindUnique.mockResolvedValue({
      id: "internal-ticket-id",
      number: 43,
      status: "WAITING",
      queue: {
        name: "General Queue",
        service: {
          name: "Consultation",
          organization: {
            name: "Metro Health",
          },
        },
      },
      counter: null,
    });

    const response = await GET(new Request("http://localhost"), { params });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.counter).toBeNull();
  });
});
