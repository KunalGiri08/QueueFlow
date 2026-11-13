import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { broker } from "@/lib/realtime/broker";
import {
  createRealtimeEnvelope,
  customerTicketChannel,
  customerQueueChannel,
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

import { POST, GET } from "./route";

const validToken = "5f2d4e8a1b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e";

function makePostRequest(body: unknown, url = "http://localhost/api/realtime/tickets/stream"): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/realtime/tickets/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    broker.clear();
  });

  afterEach(() => {
    broker.clear();
  });

  describe("Authorization & Validation", () => {
    it("returns 400 when request body is not valid JSON", async () => {
      const request = new Request("http://localhost/api/realtime/tickets/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json-at-all",
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "A valid tracking token is required" });
    });

    it("returns 400 when trackingToken is missing from body", async () => {
      const response = await POST(makePostRequest({}));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "A valid tracking token is required" });
    });

    it("returns 400 when trackingToken is empty or whitespace", async () => {
      const response = await POST(makePostRequest({ trackingToken: "   " }));
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "A valid tracking token is required" });
    });

    it("returns 400 when trackingToken is passed in the URL query parameter", async () => {
      const response = await POST(
        makePostRequest(
          { trackingToken: validToken },
          `http://localhost/api/realtime/tickets/stream?trackingToken=${validToken}`,
        ),
      );
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "Tracking token must not be passed in the URL" });
    });

    it("returns 413 when request body exceeds maximum payload size", async () => {
      const largeBody = JSON.stringify({ trackingToken: validToken, padding: "x".repeat(20000) });
      const request = new Request("http://localhost/api/realtime/tickets/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(largeBody.length),
        },
        body: largeBody,
      });

      const response = await POST(request);
      expect(response.status).toBe(413);
      const json = await response.json();
      expect(json).toEqual({ error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    });

    it("returns 405 Method Not Allowed for GET requests", async () => {
      const response = await GET();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("POST");
    });

    it("returns 401 when ticket is not found in database (invalid credential)", async () => {
      mockTicketFindUnique.mockResolvedValue(null);

      const response = await POST(makePostRequest({ trackingToken: validToken }));

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({ error: "Invalid tracking token" });
      expect(mockTicketFindUnique).toHaveBeenCalledWith({
        where: { trackingToken: validToken },
        select: { id: true, status: true, number: true, queueId: true },
      });
    });

    it("returns 410 when ticket is in a terminal state (COMPLETED, SKIPPED, CANCELLED)", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "COMPLETED",
        number: 42,
      });

      const response = await POST(makePostRequest({ trackingToken: validToken }));

      expect(response.status).toBe(410);
      const json = await response.json();
      expect(json).toEqual({
        error: "Ticket is in a terminal state",
        status: "COMPLETED",
      });
    });

    it("returns 500 without leaking sensitive error info when database throws", async () => {
      mockTicketFindUnique.mockRejectedValue(new Error("Database connection lost"));

      const response = await POST(makePostRequest({ trackingToken: validToken }));

      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json).toEqual({ error: "Internal server error" });
      // Ensure raw error message and token are not in response body
      expect(JSON.stringify(json)).not.toContain("Database connection lost");
      expect(JSON.stringify(json)).not.toContain(validToken);
    });
  });

  describe("SSE Connection & Headers", () => {
    it("returns 200 with proper SSE and cache-control headers for an active ticket", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await POST(makePostRequest({ trackingToken: validToken }));

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

      const response = await POST(makePostRequest({ trackingToken: validToken }));
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text).toBe(": connected\n\n");

      await reader.cancel();
    });

    it("dispatches sanitized real-time events to the correct customer channel", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await POST(makePostRequest({ trackingToken: validToken }));
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial connection comment
      await reader.read();

      // Publish an event with sensitive internal fields that must be stripped
      const channel = customerTicketChannel(validToken);
      broker.publish(
        channel,
        createRealtimeEnvelope("TICKET_CALLED", channel, {
          ticketNumber: 42,
          counterName: "Window 2",
          internalStaffId: "staff_secret_999",
          secretPii: "john@example.com",
        }),
      );

      const { value } = await reader.read();
      const text = decoder.decode(value);

      expect(text).toContain("event: TICKET_CALLED\n");
      expect(text).toContain(
        JSON.stringify({
          ticketNumber: 42,
          status: "CALLED",
          counterName: "Window 2",
        }),
      );
      // Ensure zero PII or internal IDs leaked
      expect(text).not.toContain("staff_secret_999");
      expect(text).not.toContain("john@example.com");

      await reader.cancel();
    });

    it("cleans up broker subscription and heartbeat when client aborts request", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const abortController = new AbortController();
      const request = new Request("http://localhost/api/realtime/tickets/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingToken: validToken }),
        signal: abortController.signal,
      });

      const response = await POST(request);
      const channel = customerTicketChannel(validToken);

      // Verify active subscription
      expect(broker.listenerCount(channel)).toBe(1);

      const reader = response.body!.getReader();
      // Read initial connection comment
      const initialChunk = await reader.read();
      expect(initialChunk.done).toBe(false);

      // Abort connection
      abortController.abort();

      // Subscription should be unregistered
      expect(broker.listenerCount(channel)).toBe(0);

      // Reading from closed stream should finish
      const result = await reader.read();
      expect(result.done).toBe(true);
    });

    it("closes stream automatically when a terminal event is received", async () => {
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
      });

      const response = await POST(makePostRequest({ trackingToken: validToken }));
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Initial comment
      await reader.read();

      const channel = customerTicketChannel(validToken);
      expect(broker.listenerCount(channel)).toBe(1);

      // Publish terminal event
      broker.publish(
        channel,
        createRealtimeEnvelope("TICKET_COMPLETED", channel, {
          ticketNumber: 42,
        }),
      );

      // Read terminal event
      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text).toContain("event: TICKET_COMPLETED");

      // Verify broker subscription was cleaned up
      expect(broker.listenerCount(channel)).toBe(0);

      // Next read should report stream is closed
      const next = await reader.read();
      expect(next.done).toBe(true);
    });

    it("subscribes to both ticket and queue channels and receives QUEUE_INVALIDATED", async () => {
      const queueId = "queue-sub-123";
      mockTicketFindUnique.mockResolvedValue({
        id: "ticket-1",
        status: "WAITING",
        number: 42,
        queueId,
      });

      const abortController = new AbortController();
      const request = new Request("http://localhost/api/realtime/tickets/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingToken: validToken }),
        signal: abortController.signal,
      });

      const response = await POST(request);
      const ticketChannel = customerTicketChannel(validToken);
      const queueChannel = customerQueueChannel(queueId);

      // Verify active subscriptions on BOTH channels
      expect(broker.listenerCount(ticketChannel)).toBe(1);
      expect(broker.listenerCount(queueChannel)).toBe(1);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial connection comment
      await reader.read();

      // Publish QUEUE_INVALIDATED on queue channel
      broker.publish(
        queueChannel,
        createRealtimeEnvelope("QUEUE_INVALIDATED", queueChannel, {
          queueId,
          reason: "TICKET_CALLED",
          timestamp: 999999,
        }),
      );

      // Read invalidation event
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      const text = decoder.decode(value);
      expect(text).toContain("event: QUEUE_INVALIDATED\n");
      expect(text).toContain(
        `data: {"queueId":"${queueId}","reason":"TICKET_CALLED","timestamp":999999}\n\n`,
      );

      // Queue invalidation is non-terminal: verify stream is STILL OPEN
      expect(broker.listenerCount(ticketChannel)).toBe(1);
      expect(broker.listenerCount(queueChannel)).toBe(1);

      // Abort connection
      abortController.abort();

      // Both subscriptions should be unregistered
      expect(broker.listenerCount(ticketChannel)).toBe(0);
      expect(broker.listenerCount(queueChannel)).toBe(0);
    });
  });
});
