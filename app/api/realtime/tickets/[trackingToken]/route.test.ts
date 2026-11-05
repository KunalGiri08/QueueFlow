import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { broker } from "@/lib/realtime/broker";
import {
  createRealtimeEnvelope,
  customerTicketChannel,
} from "@/lib/realtime/types";

const { mockTicketFindUnique } = vi.hoisted(() => ({
  mockTicketFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      findUnique: mockTicketFindUnique,
    },
  },
}));

import { GET } from "./route";

const validToken = "5f2d4e8a1b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e";

describe("GET /api/realtime/tickets/[trackingToken]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    broker.clear();
  });

  afterEach(() => {
    broker.clear();
  });

  describe("Authorization & Validation", () => {
    it("returns 400 when tracking token is empty or whitespace", async () => {
      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: "   " }),
      });

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "A valid tracking token is required" });
    });

    it("returns 404 when ticket is not found in database", async () => {
      mockTicketFindUnique.mockResolvedValue(null);

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json).toEqual({ error: "Ticket not found" });
      expect(mockTicketFindUnique).toHaveBeenCalledWith({
        where: { trackingToken: validToken },
        select: { id: true, status: true, number: true },
      });
    });

    it("returns 410 when ticket is in a terminal state (COMPLETED, SKIPPED, CANCELLED)", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "COMPLETED",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json).toEqual({
        error: "Ticket is in a terminal state",
        status: "COMPLETED",
      });
    });

    it("returns 500 when database lookup throws an unexpected error", async () => {
      mockTicketFindUnique.mockRejectedValue(new Error("Database connection lost"));

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json).toEqual({ error: "Internal server error" });
    });
  });

  describe("SSE Connection & Headers", () => {
    it("returns 200 with proper SSE and cache-control headers for an active ticket", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
      expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform, no-store");
      expect(response.headers.get("Connection")).toBe("keep-alive");
      expect(response.headers.get("X-Accel-Buffering")).toBe("no");
      expect(response.body).toBeInstanceOf(ReadableStream);
    });

    it("sends initial connected comment immediately", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      const reader = response.body!.getReader();
      const { value, done } = await reader.read();

      expect(done).toBe(false);
      const text = new TextDecoder().decode(value);
      expect(text).toBe(": connected\n\n");

      await reader.cancel();
    });
  });

  describe("Event Delivery & Channel Isolation", () => {
    it("delivers published events to the connected customer", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      const reader = response.body!.getReader();
      // Read initial ": connected\n\n"
      await reader.read();

      // Publish event to this customer's channel
      const channel = customerTicketChannel(validToken);
      broker.publish(
        createRealtimeEnvelope("TICKET_CALLED", channel, {
          ticketNumber: 42,
          status: "CALLED",
          counterName: "Desk 3",
        }),
      );

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain("event: TICKET_CALLED\n");
      expect(text).toContain('data: {"ticketNumber":42,"status":"CALLED","counterName":"Desk 3"}\n\n');

      await reader.cancel();
    });

    it("isolates customer channels: ignores events for other tickets", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      const reader = response.body!.getReader();
      // Read initial connection chunk
      await reader.read();

      // Publish to an unrelated channel
      const otherChannel = customerTicketChannel("other-token-999");
      broker.publish(
        createRealtimeEnvelope("TICKET_CALLED", otherChannel, {
          ticketNumber: 99,
          status: "CALLED",
          counterName: "Other Counter",
        }),
      );

      // Now publish to current channel
      const currentChannel = customerTicketChannel(validToken);
      broker.publish(
        createRealtimeEnvelope("TICKET_SERVING", currentChannel, {
          ticketNumber: 42,
          status: "SERVING",
          counterName: "Desk 3",
        }),
      );

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      // Must receive only current channel's event
      expect(text).toContain("event: TICKET_SERVING");
      expect(text).not.toContain("Other Counter");
      expect(text).not.toContain("99");

      await reader.cancel();
    });

    it("sanitizes payloads to ensure no customer PII or staff/internal IDs are exposed", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      const reader = response.body!.getReader();
      await reader.read(); // skip ": connected\n\n"

      // Publish an event that maliciously or accidentally includes internal/staff data
      const channel = customerTicketChannel(validToken);
      broker.publish(
        createRealtimeEnvelope("TICKET_CALLED", channel, {
          ticketNumber: 42,
          status: "CALLED",
          counterName: "Counter A",
          // Sensitive data that must NOT reach customer SSE:
          staffId: "secret-staff-uuid",
          customerEmail: "user@example.com",
          customerPhone: "+15551234567",
          internalNotes: "VIP customer",
        }),
      );

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);

      expect(text).toContain("event: TICKET_CALLED\n");
      expect(text).toContain('"ticketNumber":42');
      expect(text).toContain('"counterName":"Counter A"');
      expect(text).not.toContain("secret-staff-uuid");
      expect(text).not.toContain("user@example.com");
      expect(text).not.toContain("+15551234567");
      expect(text).not.toContain("VIP customer");

      await reader.cancel();
    });
  });

  describe("Disconnection, Cleanup & Terminal State", () => {
    it("cleans up broker listener when client aborts the request", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const abortController = new AbortController();
      const channel = customerTicketChannel(validToken);

      expect(broker.listenerCount(channel)).toBe(0);

      await GET(
        new Request("http://localhost", { signal: abortController.signal }),
        { params: Promise.resolve({ trackingToken: validToken }) },
      );

      // Verify active subscription
      expect(broker.listenerCount(channel)).toBe(1);

      // Abort connection
      abortController.abort();

      // Verify listener cleanup
      expect(broker.listenerCount(channel)).toBe(0);
    });

    it("cleans up broker listener when stream reader cancels", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const channel = customerTicketChannel(validToken);

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      expect(broker.listenerCount(channel)).toBe(1);

      const reader = response.body!.getReader();
      await reader.cancel();

      expect(broker.listenerCount(channel)).toBe(0);
    });

    it("closes stream automatically after delivering a terminal event", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "SERVING",
        number: 42,
      });

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ trackingToken: validToken }),
      });

      const reader = response.body!.getReader();
      await reader.read(); // skip ": connected\n\n"

      const channel = customerTicketChannel(validToken);
      broker.publish(
        createRealtimeEnvelope("TICKET_COMPLETED", channel, {
          ticketNumber: 42,
          status: "COMPLETED",
        }),
      );

      const { value } = await reader.read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain("event: TICKET_COMPLETED");

      // Verify stream is closed after terminal event
      const nextRead = await reader.read();
      expect(nextRead.done).toBe(true);
      expect(broker.listenerCount(channel)).toBe(0);
    });
  });

  describe("Heartbeat Behavior", () => {
    it("sends periodic heartbeat comments", async () => {
      vi.useFakeTimers();

      try {
        mockTicketFindUnique.mockResolvedValue({
          id: "ticket-1",
          status: "WAITING",
          number: 42,
        });

        const response = await GET(new Request("http://localhost"), {
          params: Promise.resolve({ trackingToken: validToken }),
        });

        const reader = response.body!.getReader();
        // Initial connection message
        const chunk1 = await reader.read();
        expect(new TextDecoder().decode(chunk1.value)).toBe(": connected\n\n");

        // Advance timer by 15000ms
        await vi.advanceTimersByTimeAsync(15000);

        const chunk2 = await reader.read();
        expect(new TextDecoder().decode(chunk2.value)).toBe(": heartbeat\n\n");

        await reader.cancel();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

