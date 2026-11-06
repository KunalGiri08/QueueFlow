import { describe, it, expect, vi, beforeEach } from "vitest";
import { RealtimeBroker } from "./broker";
import {
  PostCommitCollector,
  executeWithPostCommit,
  stageCustomerQueueInvalidated,
} from "./post-commit";
import {
  createRealtimeEnvelope,
  customerTicketChannel,
  customerQueueChannel,
  staffOrgChannel,
  type RealtimeEnvelope,
  type CustomerQueueInvalidatedPayload,
} from "./types";

describe("Post-Commit Real-Time Dispatcher", () => {
  let testBroker: RealtimeBroker;

  beforeEach(() => {
    testBroker = new RealtimeBroker();
  });

  describe("PostCommitCollector", () => {
    it("stages events without publishing them immediately", () => {
      const channel = customerTicketChannel("tok_1");
      const listener = vi.fn();
      testBroker.subscribe(channel, listener);

      const collector = new PostCommitCollector();
      const event = createRealtimeEnvelope("TICKET_CALLED", channel, {
        ticketNumber: 12,
        status: "CALLED",
        counterName: "C1",
      });

      collector.stage(event);

      // Verify staged in collector
      expect(collector.size).toBe(1);
      expect(collector.getStagedEvents()).toEqual([event]);

      // Verify NOT yet received by broker listener
      expect(listener).not.toHaveBeenCalled();
    });

    it("publishes all staged events on dispatch() and empties collector", () => {
      const channel = customerTicketChannel("tok_1");
      const listener = vi.fn();
      testBroker.subscribe(channel, listener);

      const collector = new PostCommitCollector();
      const event1 = createRealtimeEnvelope("TICKET_CALLED", channel, {
        ticketNumber: 12,
        status: "CALLED",
        counterName: "C1",
      });
      const event2 = createRealtimeEnvelope("TICKET_SERVING", channel, {
        ticketNumber: 12,
        status: "SERVING",
        counterName: "C1",
      });

      collector.stage(event1);
      collector.stage(event2);

      const dispatched = collector.dispatch(testBroker);

      expect(dispatched).toHaveLength(2);
      expect(collector.size).toBe(0);
      expect(collector.getStagedEvents()).toHaveLength(0);

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenNthCalledWith(1, event1);
      expect(listener).toHaveBeenNthCalledWith(2, event2);
    });

    it("discards staged events on clear() without publishing", () => {
      const channel = "test:ch";
      const listener = vi.fn();
      testBroker.subscribe(channel, listener);

      const collector = new PostCommitCollector();
      collector.stage(createRealtimeEnvelope("TICKET_CANCELLED", channel, { ticketNumber: 1, status: "CANCELLED" }));

      collector.clear();
      expect(collector.size).toBe(0);

      collector.dispatch(testBroker);
      expect(listener).not.toHaveBeenCalled();
    });

    it("throws when staging null or non-object event", () => {
      const collector = new PostCommitCollector();
      expect(() => {
        // @ts-expect-error Testing invalid runtime input
        collector.stage(null);
      }).toThrow("Cannot stage null or non-object event");
    });
  });

  describe("executeWithPostCommit", () => {
    it("dispatches staged events after the asynchronous action successfully resolves", async () => {
      const channel = staffOrgChannel("org_1");
      const received: RealtimeEnvelope<unknown>[] = [];
      testBroker.subscribe(channel, (e) => {
        received.push(e);
      });

      let actionCompleted = false;

      const result = await executeWithPostCommit(async (collector) => {
        // Stage event inside transaction block
        collector.stage(
          createRealtimeEnvelope("TICKET_CREATED", channel, {
            ticketId: "t1",
            ticketNumber: 100,
            queueId: "q1",
            waitingCount: 1,
          }),
        );

        // Simulate async DB query
        await new Promise((resolve) => setTimeout(resolve, 10));
        actionCompleted = true;

        return { id: "t1", status: "WAITING" };
      }, testBroker);

      expect(actionCompleted).toBe(true);
      expect(result).toEqual({ id: "t1", status: "WAITING" });

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("TICKET_CREATED");
      expect(received[0].channel).toBe(channel);
    });

    it("guarantees NO events are dispatched before the transaction completes", async () => {
      const channel = customerTicketChannel("tok_fast");
      const received: RealtimeEnvelope<unknown>[] = [];
      testBroker.subscribe(channel, (e) => {
        received.push(e);
      });

      let inspectedBeforeCommit = -1;

      await executeWithPostCommit(async (collector) => {
        collector.stage(
          createRealtimeEnvelope("TICKET_CALLED", channel, {
            ticketNumber: 10,
            status: "CALLED",
            counterName: "Desk 1",
          }),
        );

        // Record number of received events BEFORE action completes
        inspectedBeforeCommit = received.length;

        await new Promise((resolve) => setTimeout(resolve, 15));
      }, testBroker);

      // Must be 0 before the action returned
      expect(inspectedBeforeCommit).toBe(0);
      // Must be 1 after execution resolved
      expect(received).toHaveLength(1);
    });

    it("publishes ZERO events if the transaction or action throws an error", async () => {
      const channel = customerTicketChannel("tok_fail");
      const listener = vi.fn();
      testBroker.subscribe(channel, listener);

      const simulatedDbError = new Error("Prisma transaction conflict P2034 / serialization failure");

      await expect(
        executeWithPostCommit(async (collector) => {
          collector.stage(
            createRealtimeEnvelope("TICKET_CANCELLED", channel, {
              ticketNumber: 5,
              status: "CANCELLED",
            }),
          );

          // Simulated failure: transaction rolls back
          throw simulatedDbError;
        }, testBroker),
      ).rejects.toThrow(simulatedDbError);

      // Verify zero events were emitted to subscribers
      expect(listener).not.toHaveBeenCalled();
    });

    it("publishes multiple staged events in the exact order staged", async () => {
      const channel = "order:channel";
      const callOrder: string[] = [];
      testBroker.subscribe(channel, (e) => {
        callOrder.push(e.type);
      });

      await executeWithPostCommit(async (collector) => {
        collector.stage(createRealtimeEnvelope("TICKET_CREATED", channel, {}));
        collector.stage(createRealtimeEnvelope("TICKET_CALLED", channel, {}));
        collector.stage(createRealtimeEnvelope("TICKET_SERVING", channel, {}));
        collector.stage(createRealtimeEnvelope("TICKET_COMPLETED", channel, {}));
      }, testBroker);

      expect(callOrder).toEqual([
        "TICKET_CREATED",
        "TICKET_CALLED",
        "TICKET_SERVING",
        "TICKET_COMPLETED",
      ]);
    });
  });

  describe("stageCustomerQueueInvalidated (Phase 4)", () => {
    it("stages a QUEUE_INVALIDATED event on the customer queue channel", async () => {
      const queueId = "queue-123";
      const channel = customerQueueChannel(queueId);
      const listener = vi.fn();
      testBroker.subscribe<CustomerQueueInvalidatedPayload>(channel, listener);

      await executeWithPostCommit(async (collector) => {
        stageCustomerQueueInvalidated(collector, queueId, {
          reason: "TICKET_CREATED",
        });
      }, testBroker);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.type).toBe("QUEUE_INVALIDATED");
      expect(event.channel).toBe(channel);
      expect(event.payload.queueId).toBe(queueId);
      expect(event.payload.reason).toBe("TICKET_CREATED");
      expect(typeof event.payload.timestamp).toBe("number");
    });

    it("ignores null, undefined, or empty queueId without throwing", async () => {
      const collector = new PostCommitCollector();

      stageCustomerQueueInvalidated(collector, null);
      stageCustomerQueueInvalidated(collector, undefined);
      stageCustomerQueueInvalidated(collector, "   ");

      expect(collector.size).toBe(0);
    });
  });
});
