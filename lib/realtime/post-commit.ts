/**
 * QueueFlow Post-Commit Real-Time Event Dispatcher
 *
 * Guarantees:
 * 1. Transaction-Authoritative: Staged events are ONLY published after the database
 *    transaction or asynchronous operation has successfully resolved.
 * 2. Zero Phantom Events: If the operation throws, rejects, or the Prisma transaction
 *    rolls back, all staged events are discarded and zero events are published.
 * 3. Never Inside Transaction: Events are NEVER dispatched from within the transaction
 *    callback, ensuring isolation from uncommitted database state.
 *
 * Limitations & Reliability Boundaries:
 * - Best-Effort In-Memory Delivery: Events are dispatched to the process-local broker
 *   in-memory immediately after the database operation completes.
 * - Process-Crash Window: There exists an unavoidable microsecond-to-millisecond window
 *   between the moment PostgreSQL commits the transaction and the moment the Node.js
 *   process completes in-memory publication. If the Node.js process crashes, is killed
 *   (e.g., OOM or container termination), or EC2 loses power during this exact window,
 *   the committed database changes will NOT result in dispatched events.
 * - Single-Process Scope: In-memory events are delivered only to subscribers connected
 *   to the same Node.js process. They do not cross process or container boundaries.
 * - No Transactional Outbox: A durable transactional outbox table in PostgreSQL is NOT
 *   implemented in Phase 2. The database remains the single source of truth, and clients
 *   must reconcile state upon reconnection.
 */

import { broker as defaultBroker, RealtimeBroker } from "./broker";
import type { RealtimeEnvelope } from "./types";

export class PostCommitCollector {
  private stagedEvents: RealtimeEnvelope<unknown>[] = [];

  /**
   * Stages an event to be dispatched only after the transaction succeeds.
   * Does NOT publish immediately.
   */
  stage(event: RealtimeEnvelope<unknown>): void {
    if (!event || typeof event !== "object") {
      throw new Error("Cannot stage null or non-object event");
    }
    this.stagedEvents.push(event);
  }

  /**
   * Returns a read-only view of the currently staged events.
   */
  getStagedEvents(): readonly RealtimeEnvelope<unknown>[] {
    return this.stagedEvents;
  }

  /**
   * Returns the count of currently staged events.
   */
  get size(): number {
    return this.stagedEvents.length;
  }

  /**
   * Clears all staged events without publishing.
   */
  clear(): void {
    this.stagedEvents = [];
  }

  /**
   * Dispatches all staged events to the broker and clears the internal queue.
   * Call this STRICTLY after the Prisma transaction has resolved.
   */
  dispatch(targetBroker: RealtimeBroker = defaultBroker): RealtimeEnvelope<unknown>[] {
    const toDispatch = [...this.stagedEvents];
    this.stagedEvents = [];

    for (const event of toDispatch) {
      targetBroker.publish(event);
    }

    return toDispatch;
  }
}

/**
 * Executes an async or transactional operation with a post-commit collector.
 *
 * Staged events are published to the broker if and only if the `action`
 * promise resolves successfully.
 *
 * If `action` rejects or throws an error (such as a Prisma transaction conflict
 * or rollback), staged events are discarded and the error is rethrown.
 *
 * @param action - Async function executing the transaction or database work.
 * @param targetBroker - Optional broker instance (defaults to singleton `broker`).
 */
export async function executeWithPostCommit<T>(
  action: (collector: PostCommitCollector) => Promise<T>,
  targetBroker: RealtimeBroker = defaultBroker,
): Promise<T> {
  const collector = new PostCommitCollector();

  // If action rejects, control never reaches collector.dispatch(),
  // and staged events are discarded.
  const result = await action(collector);

  // Reached strictly AFTER action has resolved (transaction committed)
  collector.dispatch(targetBroker);

  return result;
}

