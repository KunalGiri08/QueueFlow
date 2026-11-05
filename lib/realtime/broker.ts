import type { RealtimeEnvelope } from "./types";

export type EventSubscriber<T = unknown> = (
  event: RealtimeEnvelope<T>,
) => unknown;

export class RealtimeBroker {
  private channels = new Map<string, Set<EventSubscriber<unknown>>>();

  /**
   * Subscribes a listener callback to events published on the specified channel.
   * Returns an unsubscribe function for convenient cleanup.
   */
  subscribe<T = unknown>(
    channel: string,
    listener: EventSubscriber<T>,
  ): () => void {
    if (!channel || typeof channel !== "string") {
      throw new Error("A valid channel string is required to subscribe");
    }
    if (typeof listener !== "function") {
      throw new Error("Listener must be a function");
    }

    let listeners = this.channels.get(channel);
    if (!listeners) {
      listeners = new Set<EventSubscriber<unknown>>();
      this.channels.set(channel, listeners);
    }

    listeners.add(listener as EventSubscriber<unknown>);

    return () => {
      this.unsubscribe(channel, listener);
    };
  }

  /**
   * Explicitly unsubscribes a listener from the specified channel.
   * Automatically cleans up empty channel sets to prevent memory leaks.
   */
  unsubscribe<T = unknown>(
    channel: string,
    listener: EventSubscriber<T>,
  ): void {
    const listeners = this.channels.get(channel);
    if (!listeners) {
      return;
    }

    listeners.delete(listener as EventSubscriber<unknown>);

    if (listeners.size === 0) {
      this.channels.delete(channel);
    }
  }

  /**
   * Publishes an event to all subscribers of the specified channel.
   * Isolates listener exceptions so one failing listener cannot block others.
   */
  publish<T = unknown>(channel: string, event: RealtimeEnvelope<T>): void;
  publish<T = unknown>(event: RealtimeEnvelope<T>): void;
  publish<T = unknown>(
    arg1: string | RealtimeEnvelope<T>,
    arg2?: RealtimeEnvelope<T>,
  ): void {
    const channel = typeof arg1 === "string" ? arg1 : arg1.channel;
    const event = typeof arg1 === "string" ? arg2 : arg1;

    if (!channel || typeof channel !== "string") {
      throw new Error("Cannot publish event without a valid channel");
    }
    if (!event || typeof event !== "object") {
      throw new Error("Cannot publish null or non-object event");
    }

    const listeners = this.channels.get(channel);
    if (!listeners || listeners.size === 0) {
      return;
    }

    // Clone into an array to guard against set mutation during iteration
    // (e.g., if a listener unsubscribes itself during callback execution)
    const activeListeners = Array.from(listeners);

    for (const listener of activeListeners) {
      try {
        const result = listener(event as RealtimeEnvelope<unknown>);
        if (
          result !== null &&
          typeof result === "object" &&
          "catch" in result &&
          typeof (result as Promise<void>).catch === "function"
        ) {
          (result as Promise<void>).catch((err: unknown) => {
            console.error(
              `[RealtimeBroker] Unhandled rejection in subscriber for channel "${channel}":`,
              err,
            );
          });
        }
      } catch (err) {
        console.error(
          `[RealtimeBroker] Error in subscriber for channel "${channel}":`,
          err,
        );
      }
    }
  }

  /**
   * Returns the count of active listeners for a specific channel,
   * or total listeners across all channels if no channel is provided.
   */
  listenerCount(channel?: string): number {
    if (channel !== undefined) {
      return this.channels.get(channel)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.channels.values()) {
      total += set.size;
    }
    return total;
  }

  /**
   * Returns the number of currently active channels with at least one subscriber.
   */
  channelCount(): number {
    return this.channels.size;
  }

  /**
   * Clears all channels and listeners. Intended for testing teardown.
   */
  clear(): void {
    this.channels.clear();
  }
}

// ============================================================================
// Process-Local Singleton
// ============================================================================

const globalForBroker = globalThis as unknown as {
  realtimeBroker: RealtimeBroker | undefined;
};

export const broker: RealtimeBroker =
  globalForBroker.realtimeBroker ?? new RealtimeBroker();

if (process.env.NODE_ENV !== "production") {
  globalForBroker.realtimeBroker = broker;
}
