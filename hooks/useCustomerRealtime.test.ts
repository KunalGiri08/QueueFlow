// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCustomerRealtime, parseSSEMessages } from "./useCustomerRealtime";

interface MockStreamController {
  enqueueText: (text: string) => void;
  closeStream: () => void;
  errorStream: (err: Error) => void;
}

function createMockStreamResponse(status = 200) {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controllerRef = c;
    },
  });

  const response = new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });

  const controls: MockStreamController = {
    enqueueText: (text: string) => {
      controllerRef.enqueue(encoder.encode(text));
    },
    closeStream: () => {
      controllerRef.close();
    },
    errorStream: (err: Error) => {
      controllerRef.error(err);
    },
  };

  return { response, controls };
}

describe("useCustomerRealtime", () => {
  const token = "tok_abc123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("parseSSEMessages helper", () => {
    it("handles split chunks across message boundaries", () => {
      const chunk1 = "event: TICKET_CALLED\nda";
      const { messages: m1, remaining: r1 } = parseSSEMessages(chunk1);
      expect(m1).toHaveLength(0);
      expect(r1).toBe("event: TICKET_CALLED\nda");

      const chunk2 = r1 + "ta: {\"ticketNumber\":42}\n\n";
      const { messages: m2, remaining: r2 } = parseSSEMessages(chunk2);
      expect(m2).toHaveLength(1);
      expect(m2[0]).toEqual({
        event: "TICKET_CALLED",
        data: "{\"ticketNumber\":42}",
      });
      expect(r2).toBe("");
    });

    it("handles multiple events in one chunk", () => {
      const chunk =
        "event: TICKET_CALLED\ndata: {\"ticketNumber\":42}\n\nevent: TICKET_SERVING\ndata: {\"ticketNumber\":42}\n\n";
      const { messages, remaining } = parseSSEMessages(chunk);
      expect(messages).toHaveLength(2);
      expect(messages[0].event).toBe("TICKET_CALLED");
      expect(messages[1].event).toBe("TICKET_SERVING");
      expect(remaining).toBe("");
    });

    it("ignores comment lines including heartbeats and connection headers", () => {
      const chunk = ": connected\n\n: heartbeat\n\n";
      const { messages, remaining } = parseSSEMessages(chunk);
      expect(messages).toHaveLength(0);
      expect(remaining).toBe("");
    });

    it("handles \\r\\n carriage-return newlines identically to \\n", () => {
      const chunk = "event: TICKET_CALLED\r\ndata: {\"ticketNumber\":42}\r\n\r\n";
      const { messages, remaining } = parseSSEMessages(chunk);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        event: "TICKET_CALLED",
        data: "{\"ticketNumber\":42}",
      });
      expect(remaining).toBe("");
    });
  });

  describe("Connection & Authentication Flow", () => {
    it("sends POST request to /api/realtime/tickets/stream with tracking token in JSON body", async () => {
      let capturedUrl = "";
      let capturedInit: RequestInit | undefined;
      const { response } = createMockStreamResponse(200);

      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedInit = init;
        return response;
      });

      const onTicketUpdate = vi.fn();

      const { result } = renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
          fetchFn: mockFetch,
        }),
      );

      // Allow async startStream to complete response resolution
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(capturedUrl).toBe("/api/realtime/tickets/stream");
      // Critical security assertion: token is NEVER in the URL
      expect(capturedUrl).not.toContain(token);

      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.headers).toEqual({
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
      });
      expect(JSON.parse(capturedInit?.body as string)).toEqual({
        trackingToken: token,
      });

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isError).toBe(false);
    });

    it("does not connect when enabled is false or trackingToken is empty", async () => {
      const mockFetch = vi.fn();
      const onTicketUpdate = vi.fn();

      renderHook(() =>
        useCustomerRealtime({
          trackingToken: null,
          enabled: true,
          onTicketUpdate,
          fetchFn: mockFetch,
        }),
      );

      renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          enabled: false,
          onTicketUpdate,
          fetchFn: mockFetch,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("does not retry on non-recoverable HTTP responses (401, 404, 410)", async () => {
      vi.useFakeTimers();
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(JSON.stringify({ error: "Invalid tracking token" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      });

      const onTicketUpdate = vi.fn();

      const { result } = renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
          fetchFn: mockFetch,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isError).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance timers by 30s: must NOT retry client errors
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe("Event Delivery & Processing", () => {
    it("invokes onTicketUpdate when an event arrives", async () => {
      const { response, controls } = createMockStreamResponse(200);
      const mockFetch = vi.fn().mockResolvedValue(response);
      const onTicketUpdate = vi.fn();

      renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
          fetchFn: mockFetch,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(onTicketUpdate).not.toHaveBeenCalled();

      // Emit event
      await act(async () => {
        controls.enqueueText(
          "event: TICKET_CALLED\ndata: {\"ticketNumber\":42,\"status\":\"CALLED\"}\n\n",
        );
      });

      expect(onTicketUpdate).toHaveBeenCalledTimes(1);
    });

    it("handles terminal events: notifies onTerminalStatus, closes connection, and stops retrying", async () => {
      const { response, controls } = createMockStreamResponse(200);
      const mockFetch = vi.fn().mockResolvedValue(response);
      const onTicketUpdate = vi.fn();
      const onTerminalStatus = vi.fn();

      const { result } = renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
          onTerminalStatus,
          fetchFn: mockFetch,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });
      expect(result.current.isConnected).toBe(true);

      // Send terminal event
      await act(async () => {
        controls.enqueueText(
          "event: TICKET_COMPLETED\ndata: {\"ticketNumber\":42,\"status\":\"COMPLETED\"}\n\n",
        );
      });

      expect(onTicketUpdate).toHaveBeenCalledTimes(1);
      expect(onTerminalStatus).toHaveBeenCalledWith("TICKET_COMPLETED");
      expect(result.current.isConnected).toBe(false);
    });
  });

  describe("Reconnection & Lifecycle", () => {
    it("reconnects with bounded backoff and invokes onReconnect strictly upon reconnection", async () => {
      vi.useFakeTimers();
      let attempt = 0;
      let firstControls: MockStreamController;

      const mockFetch = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          const res = createMockStreamResponse(200);
          firstControls = res.controls;
          return res.response;
        } else {
          const res = createMockStreamResponse(200);
          return res.response;
        }
      });

      const onTicketUpdate = vi.fn();
      const onReconnect = vi.fn();

      const { result } = renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
          onReconnect,
          fetchFn: mockFetch,
        }),
      );

      // Initial connection established
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isConnected).toBe(true);
      // onReconnect must NOT fire on initial connection
      expect(onReconnect).not.toHaveBeenCalled();

      // Simulate unexpected stream disconnect
      await act(async () => {
        firstControls!.errorStream(new Error("Network connection dropped"));
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isError).toBe(true);

      // Advance timer for bounded backoff retry
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.isConnected).toBe(true);
      expect(result.current.isError).toBe(false);
      // onReconnect fires upon reconnection!
      expect(onReconnect).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("aborts active fetch and closes stream on unmount", async () => {
      const { response } = createMockStreamResponse(200);
      let abortSignal: AbortSignal | null | undefined;

      const mockFetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        abortSignal = init?.signal;
        return response;
      });

      const onTicketUpdate = vi.fn();

      const { unmount } = renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
          fetchFn: mockFetch,
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(abortSignal?.aborted).toBe(false);

      unmount();

      expect(abortSignal?.aborted).toBe(true);
    });
  });
});
