import { describe, it, expect, vi, beforeEach } from "vitest";
import { RealtimeBroker, broker } from "./broker";
import {
  createRealtimeEnvelope,
  customerTicketChannel,
  staffOrgChannel,
  staffQueueChannel,
  type RealtimeEnvelope,
  type CustomerTicketCalledPayload,
  type StaffTicketCreatedPayload,
} from "./types";

describe("RealtimeBroker", () => {
  let testBroker: RealtimeBroker;

  beforeEach(() => {
    testBroker = new RealtimeBroker();
  });

  describe("Event Publishing and Subscription", () => {
    it("publishes and receives strongly typed events on a channel", () => {
      const channel = customerTicketChannel("tok_abc123");
      const received: RealtimeEnvelope<CustomerTicketCalledPayload>[] = [];

      testBroker.subscribe<CustomerTicketCalledPayload>(channel, (event) => {
        received.push(event);
      });

      const event = createRealtimeEnvelope<CustomerTicketCalledPayload>(
        "TICKET_CALLED",
        channel,
        {
          ticketNumber: 42,
          status: "CALLED",
          counterName: "Counter 1",
        },
      );

      testBroker.publish(channel, event);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(event);
      expect(received[0].payload.ticketNumber).toBe(42);
      expect(received[0].payload.counterName).toBe("Counter 1");
    });

    it("supports publishing an event directly using event.channel", () => {
      const channel = staffQueueChannel("queue_99");
      const received: RealtimeEnvelope<StaffTicketCreatedPayload>[] = [];

      testBroker.subscribe<StaffTicketCreatedPayload>(channel, (event) => {
        received.push(event);
      });

      const event = createRealtimeEnvelope<StaffTicketCreatedPayload>(
        "TICKET_CREATED",
        channel,
        {
          ticketId: "tick_1",
          ticketNumber: 101,
          queueId: "queue_99",
          waitingCount: 5,
        },
      );

      // Call single-argument publish
      testBroker.publish(event);

      expect(received).toHaveLength(1);
      expect(received[0].payload.waitingCount).toBe(5);
    });

    it("supports multiple subscribers on the same channel", () => {
      const channel = staffOrgChannel("org_acme");
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      testBroker.subscribe(channel, listener1);
      testBroker.subscribe(channel, listener2);

      const event = createRealtimeEnvelope("QUEUE_STATUS_CHANGED", channel, {
        queueId: "q1",
        isActive: true,
      });

      testBroker.publish(channel, event);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith(event);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledWith(event);
    });
  });

  describe("Channel Isolation", () => {
    it("prevents subscribers from receiving events from unrelated channels", () => {
      const channelA = customerTicketChannel("token_alice");
      const channelB = customerTicketChannel("token_bob");

      const listenerA = vi.fn();
      const listenerB = vi.fn();

      testBroker.subscribe(channelA, listenerA);
      testBroker.subscribe(channelB, listenerB);

      const eventA = createRealtimeEnvelope("TICKET_CALLED", channelA, {
        ticketNumber: 1,
        status: "CALLED",
        counterName: "Desk 1",
      });

      testBroker.publish(channelA, eventA);

      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerA).toHaveBeenCalledWith(eventA);
      expect(listenerB).not.toHaveBeenCalled();
    });

    it("handles publishing to a channel with no subscribers without throwing", () => {
      const event = createRealtimeEnvelope("TICKET_CANCELLED", "empty_channel", {
        ticketNumber: 99,
        status: "CANCELLED",
      });

      expect(() => {
        testBroker.publish("empty_channel", event);
      }).not.toThrow();
    });
  });

  describe("Unsubscribe and Listener Cleanup", () => {
    it("unsubscribes via returned unsubscribe function", () => {
      const channel = "test:channel";
      const listener = vi.fn();

      const unsubscribe = testBroker.subscribe(channel, listener);
      expect(testBroker.listenerCount(channel)).toBe(1);

      unsubscribe();
      expect(testBroker.listenerCount(channel)).toBe(0);

      const event = createRealtimeEnvelope("TICKET_COMPLETED", channel, {
        ticketNumber: 5,
        status: "COMPLETED",
      });
      testBroker.publish(channel, event);

      expect(listener).not.toHaveBeenCalled();
    });

    it("unsubscribes via explicit unsubscribe method", () => {
      const channel = "test:channel";
      const listener = vi.fn();

      testBroker.subscribe(channel, listener);
      expect(testBroker.listenerCount(channel)).toBe(1);

      testBroker.unsubscribe(channel, listener);
      expect(testBroker.listenerCount(channel)).toBe(0);
    });

    it("cleans up channel from internal map when last listener is removed (preventing memory leaks)", () => {
      const channel = "ephemeral:customer:123";
      const listener = vi.fn();

      expect(testBroker.channelCount()).toBe(0);

      const unsubscribe = testBroker.subscribe(channel, listener);
      expect(testBroker.channelCount()).toBe(1);
      expect(testBroker.listenerCount(channel)).toBe(1);

      unsubscribe();
      expect(testBroker.channelCount()).toBe(0);
      expect(testBroker.listenerCount(channel)).toBe(0);
    });

    it("cleans all channels on clear()", () => {
      testBroker.subscribe("ch1", () => {});
      testBroker.subscribe("ch2", () => {});
      expect(testBroker.channelCount()).toBe(2);
      expect(testBroker.listenerCount()).toBe(2);

      testBroker.clear();
      expect(testBroker.channelCount()).toBe(0);
      expect(testBroker.listenerCount()).toBe(0);
    });
  });

  describe("Fault Tolerance and Exception Handling", () => {
    it("continues notifying remaining subscribers when one subscriber throws an error", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const channel = "error:channel";
      const failingListener = vi.fn(() => {
        throw new Error("Subscriber crash");
      });
      const healthyListener = vi.fn();

      testBroker.subscribe(channel, failingListener);
      testBroker.subscribe(channel, healthyListener);

      const event = createRealtimeEnvelope("TICKET_CALLED", channel, {
        ticketNumber: 7,
        status: "CALLED",
        counterName: "C1",
      });

      testBroker.publish(channel, event);

      expect(failingListener).toHaveBeenCalledTimes(1);
      expect(healthyListener).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RealtimeBroker] Error in subscriber for channel "error:channel":'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("catches asynchronous promise rejections from listeners", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const channel = "async:error:channel";
      const failingAsyncListener = vi.fn().mockRejectedValue(new Error("Async rejection"));
      const healthyListener = vi.fn();

      testBroker.subscribe(channel, failingAsyncListener);
      testBroker.subscribe(channel, healthyListener);

      const event = createRealtimeEnvelope("TICKET_CALLED", channel, {
        ticketNumber: 7,
        status: "CALLED",
        counterName: "C1",
      });

      testBroker.publish(channel, event);

      expect(failingAsyncListener).toHaveBeenCalledTimes(1);
      expect(healthyListener).toHaveBeenCalledTimes(1);

      // Flush microtasks
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RealtimeBroker] Unhandled rejection in subscriber for channel "async:error:channel":'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });

    it("safely handles unsubscription during event callback iteration", () => {
      const channel = "mutating:channel";
      let unsubscribe2: (() => void) | null = null;

      const listener1 = vi.fn(() => {
        if (unsubscribe2) unsubscribe2();
      });
      const listener2 = vi.fn();

      testBroker.subscribe(channel, listener1);
      unsubscribe2 = testBroker.subscribe(channel, listener2);

      const event = createRealtimeEnvelope("TICKET_COMPLETED", channel, {
        ticketNumber: 10,
        status: "COMPLETED",
      });

      // Iteration array snapshot prevents iteration disruption
      expect(() => testBroker.publish(channel, event)).not.toThrow();
      expect(listener1).toHaveBeenCalledTimes(1);
    });
  });

  describe("Input Validation", () => {
    it("throws when subscribing with invalid channel", () => {
      expect(() => {
        testBroker.subscribe("", vi.fn());
      }).toThrow("A valid channel string is required to subscribe");
    });

    it("throws when subscribing with non-function listener", () => {
      expect(() => {
        // @ts-expect-error Testing invalid runtime input
        testBroker.subscribe("ch", null);
      }).toThrow("Listener must be a function");
    });

    it("throws when publishing without a valid channel", () => {
      expect(() => {
        // @ts-expect-error Testing invalid runtime input
        testBroker.publish("", {});
      }).toThrow("Cannot publish event without a valid channel");
    });

    it("throws when publishing null or non-object event", () => {
      expect(() => {
        // @ts-expect-error Testing invalid runtime input
        testBroker.publish("ch", null);
      }).toThrow("Cannot publish null or non-object event");
    });
  });

  describe("Singleton Export", () => {
    it("exports a functioning process-local broker singleton", () => {
      expect(broker).toBeInstanceOf(RealtimeBroker);
    });
  });
});

