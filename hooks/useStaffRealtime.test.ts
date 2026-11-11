// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStaffRealtime } from "./useStaffRealtime";

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
      try {
        controllerRef.enqueue(encoder.encode(text));
      } catch {}
    },
    closeStream: () => {
      try {
        controllerRef.close();
      } catch {}
    },
    errorStream: (err: Error) => {
      try {
        controllerRef.error(err);
      } catch {}
    },
  };

  return { response, controls };
}

describe("useStaffRealtime", () => {
  const orgId = "org-123";
  const staffId = "staff-456";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not connect when orgId or staffId is null, or enabled is false", () => {
    const fetchMock = vi.fn();

    renderHook(() =>
      useStaffRealtime({
        orgId: null,
        staffId: null,
        enabled: true,
        onQueueInvalidated: vi.fn(),
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();

    renderHook(() =>
      useStaffRealtime({
        orgId,
        staffId,
        enabled: false,
        onQueueInvalidated: vi.fn(),
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends POST request to /api/realtime/staff/stream with organizationId in JSON body", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const { response } = createMockStreamResponse(200);

    const fetchMock = vi.fn().mockImplementation((url, init) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return Promise.resolve(response);
    });

    renderHook(() =>
      useStaffRealtime({
        orgId,
        staffId,
        queueIds: ["q1", "q2"],
        enabled: true,
        onQueueInvalidated: vi.fn(),
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedUrl).toBe("/api/realtime/staff/stream");
    const parsedBody = JSON.parse(capturedBody);
    expect(parsedBody.organizationId).toBe(orgId);
    expect(parsedBody.queueIds).toEqual(["q1", "q2"]);
  });

  it("triggers onQueueInvalidated callback immediately upon receiving QUEUE_INVALIDATED message", async () => {
    const onQueueInvalidated = vi.fn();
    const { response, controls } = createMockStreamResponse(200);

    const fetchMock = vi.fn().mockResolvedValue(response);

    const hook = renderHook(() =>
      useStaffRealtime({
        orgId,
        staffId,
        enabled: true,
        onQueueInvalidated,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.result.current.isConnected).toBe(true);
    expect(onQueueInvalidated).not.toHaveBeenCalled();

    // Push initial heartbeat comment and QUEUE_INVALIDATED event
    await act(async () => {
      controls.enqueueText(": heartbeat\n\n");
      controls.enqueueText(
        `event: QUEUE_INVALIDATED\ndata: {"queueId":"q1","reason":"TICKET_CREATED"}\n\n`,
      );
      await Promise.resolve();
    });

    expect(onQueueInvalidated).toHaveBeenCalledTimes(1);
    expect(onQueueInvalidated).toHaveBeenCalledWith({
      queueId: "q1",
      reason: "TICKET_CREATED",
    });

    // Cleanup
    act(() => {
      controls.closeStream();
    });
  });

  it("throttles rapid burst invalidation events to prevent redundant queries", async () => {
    vi.useFakeTimers();
    const onQueueInvalidated = vi.fn();
    const { response, controls } = createMockStreamResponse(200);

    const fetchMock = vi.fn().mockResolvedValue(response);

    renderHook(() =>
      useStaffRealtime({
        orgId,
        staffId,
        enabled: true,
        onQueueInvalidated,
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Push 3 events within the throttle window (250ms)
    await act(async () => {
      controls.enqueueText(
        `event: QUEUE_INVALIDATED\ndata: {"queueId":"q1","reason":"TICKET_CREATED_1"}\n\n`,
      );
      await Promise.resolve();
    });

    // First event fires immediately
    expect(onQueueInvalidated).toHaveBeenCalledTimes(1);

    await act(async () => {
      controls.enqueueText(
        `event: QUEUE_INVALIDATED\ndata: {"queueId":"q1","reason":"TICKET_CREATED_2"}\n\n`,
      );
      controls.enqueueText(
        `event: QUEUE_INVALIDATED\ndata: {"queueId":"q1","reason":"TICKET_CREATED_3"}\n\n`,
      );
      await Promise.resolve();
    });

    // Still only 1 call before throttle timer expires
    expect(onQueueInvalidated).toHaveBeenCalledTimes(1);

    // Advance timers past THROTTLE_REFETCH_MS (250ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Second throttled call executes with the FINAL event payload (no event lost)
    expect(onQueueInvalidated).toHaveBeenCalledTimes(2);
    expect(onQueueInvalidated).toHaveBeenLastCalledWith({
      queueId: "q1",
      reason: "TICKET_CREATED_3",
    });

    act(() => {
      controls.closeStream();
    });
  });

  it("handles non-recoverable 403 error without reconnect loop", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });

    const fetchMock = vi.fn().mockResolvedValue(errorResponse);

    const hook = renderHook(() =>
      useStaffRealtime({
        orgId,
        staffId,
        enabled: true,
        onQueueInvalidated: vi.fn(),
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.result.current.isConnected).toBe(false);
    expect(hook.result.current.isError).toBe(true);
    expect(hook.result.current.error?.message).toContain("HTTP status 403");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cleans up active connection and aborts signal when unmounted or closed", async () => {
    const { response, controls } = createMockStreamResponse(200);
    const fetchMock = vi.fn().mockResolvedValue(response);

    const hook = renderHook(() =>
      useStaffRealtime({
        orgId,
        staffId,
        enabled: true,
        onQueueInvalidated: vi.fn(),
        fetchFn: fetchMock as unknown as typeof fetch,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(hook.result.current.isConnected).toBe(true);

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    // Explicit close test
    act(() => {
      hook.result.current.close();
    });

    expect(hook.result.current.isConnected).toBe(false);
    expect(signal.aborted).toBe(true);

    act(() => {
      controls.closeStream();
    });
  });
});
