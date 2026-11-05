// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCustomerRealtime } from "./useCustomerRealtime";

// Mock EventSource implementation for testing
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  readyState = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSED
  listeners: Record<string, EventListener[]> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
    }
  }

  close() {
    this.readyState = 2;
  }

  // Test helper: simulate connection open
  simulateOpen() {
    this.readyState = 1;
    for (const listener of this.listeners["open"] || []) {
      listener(new Event("open"));
    }
  }

  // Test helper: simulate connection error
  simulateError() {
    for (const listener of this.listeners["error"] || []) {
      listener(new Event("error"));
    }
  }

  // Test helper: simulate receiving custom event
  simulateEvent(type: string, data: unknown) {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
    });
    for (const listener of this.listeners[type] || []) {
      listener(event);
    }
  }
}

describe("useCustomerRealtime", () => {
  const token = "tok_abc123";

  beforeEach(() => {
    MockEventSource.instances = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("connects to the authorized customer SSE endpoint", () => {
    const onTicketUpdate = vi.fn();

    const { result } = renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe(`/api/realtime/tickets/${token}`);
    expect(result.current.isConnected).toBe(false);

    // Simulate open
    act(() => {
      MockEventSource.instances[0].simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.isError).toBe(false);
  });

  it("does not connect when enabled is false or trackingToken is empty", () => {
    const onTicketUpdate = vi.fn();

    renderHook(() =>
      useCustomerRealtime({
        trackingToken: null,
        enabled: true,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(0);

    renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        enabled: false,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(0);
  });

  it("triggers onTicketUpdate when an event arrives", () => {
    const onTicketUpdate = vi.fn();

    renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    const instance = MockEventSource.instances[0];
    act(() => {
      instance.simulateOpen();
      instance.simulateEvent("TICKET_CALLED", {
        ticketNumber: 42,
        status: "CALLED",
        counterName: "Desk 1",
      });
    });

    expect(onTicketUpdate).toHaveBeenCalledTimes(1);
  });

  it("handles terminal events: notifies onTerminalStatus and closes connection", () => {
    const onTicketUpdate = vi.fn();
    const onTerminalStatus = vi.fn();

    const { result } = renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        onTicketUpdate,
        onTerminalStatus,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    const instance = MockEventSource.instances[0];
    act(() => {
      instance.simulateOpen();
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      instance.simulateEvent("TICKET_COMPLETED", {
        ticketNumber: 42,
        status: "COMPLETED",
      });
    });

    expect(onTicketUpdate).toHaveBeenCalledTimes(1);
    expect(onTerminalStatus).toHaveBeenCalledTimes(1);
    expect(onTerminalStatus).toHaveBeenCalledWith("TICKET_COMPLETED");
    expect(instance.readyState).toBe(2); // CLOSED
    expect(result.current.isConnected).toBe(false);
  });

  it("handles connection errors", () => {
    const onTicketUpdate = vi.fn();

    const { result } = renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    const instance = MockEventSource.instances[0];
    act(() => {
      instance.simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);

    act(() => {
      instance.simulateError();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isError).toBe(true);
  });

  it("triggers onReconnect (or onTicketUpdate fallback) upon SSE reconnection", () => {
    const onTicketUpdate = vi.fn();
    const onReconnect = vi.fn();

    const { result } = renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        onTicketUpdate,
        onReconnect,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    const instance = MockEventSource.instances[0];

    // Initial connection open
    act(() => {
      instance.simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);
    expect(onTicketUpdate).not.toHaveBeenCalled();
    expect(onReconnect).not.toHaveBeenCalled();

    // Transient error / disconnect
    act(() => {
      instance.simulateError();
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.isError).toBe(true);

    // Automatic reconnect open
    act(() => {
      instance.simulateOpen();
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isError).toBe(false);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onTicketUpdate).not.toHaveBeenCalled();
  });

  it("closes previous connection when trackingToken changes and avoids duplicate connections", () => {
    const onTicketUpdate = vi.fn();

    let currentToken = "token-1";
    const { rerender } = renderHook(() =>
      useCustomerRealtime({
        trackingToken: currentToken,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    expect(MockEventSource.instances).toHaveLength(1);
    const firstInstance = MockEventSource.instances[0];
    expect(firstInstance.url).toBe("/api/realtime/tickets/token-1");

    // Re-render with same token: should NOT recreate EventSource
    rerender();
    expect(MockEventSource.instances).toHaveLength(1);

    // Change token: should close first instance and create second
    currentToken = "token-2";
    rerender();

    expect(firstInstance.readyState).toBe(2); // first closed
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toBe("/api/realtime/tickets/token-2");
  });

  it("closes connection on unmount", () => {
    const onTicketUpdate = vi.fn();

    const { unmount } = renderHook(() =>
      useCustomerRealtime({
        trackingToken: token,
        onTicketUpdate,
        eventSourceFactory: (url) => new MockEventSource(url) as unknown as EventSource,
      }),
    );

    const instance = MockEventSource.instances[0];
    unmount();

    expect(instance.readyState).toBe(2); // CLOSED
  });

  it("gracefully falls back when EventSource is not supported", () => {
    const originalEventSource = window.EventSource;
    // @ts-expect-error simulating environment without EventSource
    delete window.EventSource;

    try {
      const onTicketUpdate = vi.fn();
      const { result } = renderHook(() =>
        useCustomerRealtime({
          trackingToken: token,
          onTicketUpdate,
        }),
      );

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isError).toBe(false);
    } finally {
      window.EventSource = originalEventSource;
    }
  });
});

