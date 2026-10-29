import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockTransaction,
  mockQueryRaw,
  mockTxTicketFindUniqueOrThrow,
  mockTxTicketUpdateMany,
} = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockQueryRaw: vi.fn(),
  mockTxTicketFindUniqueOrThrow: vi.fn(),
  mockTxTicketUpdateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";
import { isValidTrackingTokenFormat } from "@/lib/validations/ticket";

const validTrackingToken =
  "5f2d4e8a1b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e";

function makeParams(token: string) {
  return Promise.resolve({ trackingToken: token });
}

describe("PATCH /api/tickets/track/[trackingToken]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (callback) => {
      const tx = {
        $queryRaw: mockQueryRaw,
        ticket: {
          findUniqueOrThrow: mockTxTicketFindUniqueOrThrow,
          updateMany: mockTxTicketUpdateMany,
        },
      };
      return callback(tx);
    });
  });

  describe("Token Format Validation", () => {
    it("validates 64-character hexadecimal tokens correctly", () => {
      expect(isValidTrackingTokenFormat(validTrackingToken)).toBe(true);
      expect(
        isValidTrackingTokenFormat(validTrackingToken.toUpperCase()),
      ).toBe(true);

      // Malformed tokens
      expect(isValidTrackingTokenFormat("")).toBe(false);
      expect(isValidTrackingTokenFormat("   ")).toBe(false);
      expect(isValidTrackingTokenFormat("short-token")).toBe(false);
      expect(
        isValidTrackingTokenFormat(
          "5f2d4e8a1b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2z", // contains 'z'
        ),
      ).toBe(false);
      expect(
        isValidTrackingTokenFormat(validTrackingToken + "extra"),
      ).toBe(false);
    });

    it("returns 404 for empty or whitespace-only tracking tokens without querying the database", async () => {
      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(""),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Ticket not found" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it("returns 404 for malformed tracking token format without querying the database", async () => {
      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams("invalid-token-123!"),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Ticket not found" });
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });

  describe("Authentication Independence", () => {
    it("executes without requiring Clerk authentication or user session", async () => {
      mockQueryRaw.mockResolvedValue([
        { id: "ticket-1", status: "WAITING", number: 10 },
      ]);
      mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });
      const now = new Date();
      mockTxTicketFindUniqueOrThrow.mockResolvedValue({
        number: 10,
        status: "CANCELLED",
        cancelledAt: now,
      });

      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(validTrackingToken),
      });

      // Operates purely via tracking token authorization
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ticketNumber: 10,
        status: "CANCELLED",
        cancelledAt: now.toISOString(),
      });
    });
  });

  describe("Ticket Lookup & State Transitions", () => {
    it("returns 404 when the tracking token is not found in the database", async () => {
      mockQueryRaw.mockResolvedValue([]);

      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(validTrackingToken),
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Ticket not found" });
      expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
    });

    it.each([
      "CALLED",
      "SERVING",
      "COMPLETED",
      "SKIPPED",
      "CANCELLED",
    ] as const)(
      "returns 409 when the ticket is in %s status",
      async (nonWaitingStatus) => {
        mockQueryRaw.mockResolvedValue([
          { id: "ticket-1", status: nonWaitingStatus, number: 12 },
        ]);

        const response = await PATCH(new Request("http://localhost"), {
          params: makeParams(validTrackingToken),
        });

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          error: "Ticket cannot be cancelled in its current state",
        });
        expect(mockTxTicketUpdateMany).not.toHaveBeenCalled();
      },
    );

    it("returns 409 when updateMany fails to update any rows due to concurrent status change", async () => {
      mockQueryRaw.mockResolvedValue([
        { id: "ticket-1", status: "WAITING", number: 15 },
      ]);
      mockTxTicketUpdateMany.mockResolvedValue({ count: 0 });

      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(validTrackingToken),
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        error: "Ticket cannot be cancelled in its current state",
      });
    });

    it("successfully cancels a WAITING ticket and updates cancelledAt", async () => {
      mockQueryRaw.mockResolvedValue([
        { id: "ticket-1", status: "WAITING", number: 42 },
      ]);
      mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });
      const now = new Date();
      mockTxTicketFindUniqueOrThrow.mockResolvedValue({
        number: 42,
        status: "CANCELLED",
        cancelledAt: now,
      });

      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(validTrackingToken),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data).toEqual({
        ticketNumber: 42,
        status: "CANCELLED",
        cancelledAt: now.toISOString(),
      });

      // Verify transaction and row-level locking
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);

      // Verify conditional update arguments
      expect(mockTxTicketUpdateMany).toHaveBeenCalledWith({
        where: {
          trackingToken: validTrackingToken,
          status: "WAITING",
        },
        data: {
          status: "CANCELLED",
          cancelledAt: expect.any(Date),
        },
      });

      // Verify public field selection only
      expect(mockTxTicketFindUniqueOrThrow).toHaveBeenCalledWith({
        where: { trackingToken: validTrackingToken },
        select: {
          number: true,
          status: true,
          cancelledAt: true,
        },
      });
    });
  });

  describe("Security & Data Minimization", () => {
    it("never returns internal ticket ID, user ID, staff ID, or private organization details", async () => {
      mockQueryRaw.mockResolvedValue([
        { id: "internal-id-123", status: "WAITING", number: 7 },
      ]);
      mockTxTicketUpdateMany.mockResolvedValue({ count: 1 });
      const now = new Date();
      mockTxTicketFindUniqueOrThrow.mockResolvedValue({
        number: 7,
        status: "CANCELLED",
        cancelledAt: now,
        id: "internal-id-123",
        userId: "internal-user-456",
        servedById: "internal-staff-789",
      });

      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(validTrackingToken),
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.ticketNumber).toBe(7);
      expect(data.status).toBe("CANCELLED");
      expect(data.id).toBeUndefined();
      expect(data.userId).toBeUndefined();
      expect(data.servedById).toBeUndefined();
      expect(data.counterId).toBeUndefined();
      expect(data.queueId).toBeUndefined();
      expect(data.trackingToken).toBeUndefined();
    });

    it("returns 500 without leaking database connection strings or internal errors", async () => {
      mockTransaction.mockRejectedValue(
        new Error(
          "FATAL: password authentication failed for user postgres at postgresql://user:pass@host:5432/db",
        ),
      );

      const response = await PATCH(new Request("http://localhost"), {
        params: makeParams(validTrackingToken),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: "Internal server error" });
      expect(JSON.stringify(data)).not.toContain("postgres");
      expect(JSON.stringify(data)).not.toContain("password");
    });
  });
});
