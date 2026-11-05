import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { broker, RealtimeBroker } from "./broker";
import { createRealtimeEnvelope, customerTicketChannel } from "./types";

describe("Production Broker-Instance Sharing Verification", () => {
  beforeEach(() => {
    broker.clear();
  });

  afterEach(() => {
    broker.clear();
  });

  it("binds the exported singleton directly to globalThis.realtimeBroker", () => {
    const globalStore = globalThis as unknown as {
      realtimeBroker: RealtimeBroker | undefined;
    };

    expect(globalStore.realtimeBroker).toBeDefined();
    expect(globalStore.realtimeBroker).toBe(broker);
  });

  it("preserves subscriber state across independent import evaluations in the same process", async () => {
    const channel = customerTicketChannel("prod_test_token_123");
    const received: string[] = [];

    // Simulate Consumer A (e.g. SSE Route Handler) subscribing
    const unsubscribe = broker.subscribe(channel, (event) => {
      received.push(event.type);
    });

    // Simulate Consumer B (e.g. Mutation Endpoint or Background Dispatcher) importing and publishing
    const dynamicModule = await import("./broker");
    const publisherBroker = dynamicModule.broker;

    expect(publisherBroker).toBe(broker);

    publisherBroker.publish(
      createRealtimeEnvelope("TICKET_CALLED", channel, {
        ticketNumber: 42,
        status: "CALLED",
        counterName: "C1",
      }),
    );

    expect(received).toEqual(["TICKET_CALLED"]);
    unsubscribe();
  });

  it("functions identically regardless of NODE_ENV setting", () => {
    const prevNodeEnv = process.env.NODE_ENV;
    const envObj = process.env as Record<string, string | undefined>;
    try {
      envObj.NODE_ENV = "production";

      const globalStore = globalThis as unknown as {
        realtimeBroker: RealtimeBroker | undefined;
      };

      expect(globalStore.realtimeBroker).toBe(broker);

      const channel = "test:prod:channel";
      const listener = vi.fn();
      broker.subscribe(channel, listener);

      broker.publish(
        createRealtimeEnvelope("QUEUE_STATUS_CHANGED", channel, {
          queueId: "q1",
          isActive: true,
        }),
      );

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      envObj.NODE_ENV = prevNodeEnv;
    }
  });
});

