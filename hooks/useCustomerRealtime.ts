"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface UseCustomerRealtimeOptions {
  /** The customer's 64-character unguessable tracking token */
  trackingToken: string | null;
  /** Whether the real-time stream should be active (e.g. while ticket is in active state) */
  enabled?: boolean;
  /**
   * Invoked when an event arrives indicating ticket state changed.
   * Note: The client must fetch authoritative state from the REST API rather than
   * relying solely on the push notification payload.
   */
  onTicketUpdate: () => void | Promise<void>;
  /** Optional callback fired when a terminal event is received */
  onTerminalStatus?: (status: string) => void;
  /** Optional callback fired when SSE reconnects after connection loss */
  onReconnect?: () => void | Promise<void>;
  /** Custom factory to construct EventSource (primarily for testing) */
  eventSourceFactory?: (url: string) => EventSource;
}

export interface UseCustomerRealtimeReturn {
  isConnected: boolean;
  isError: boolean;
  error: Error | null;
  close: () => void;
}

const REALTIME_EVENT_TYPES = [
  "TICKET_CALLED",
  "TICKET_SERVING",
  "TICKET_COMPLETED",
  "TICKET_SKIPPED",
  "TICKET_CANCELLED",
  "QUEUE_STATUS_CHANGED",
] as const;

export function useCustomerRealtime({
  trackingToken,
  enabled = true,
  onTicketUpdate,
  onTerminalStatus,
  onReconnect,
  eventSourceFactory,
}: UseCustomerRealtimeOptions): UseCustomerRealtimeReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const onTicketUpdateRef = useRef(onTicketUpdate);
  const onTerminalStatusRef = useRef(onTerminalStatus);
  const onReconnectRef = useRef(onReconnect);
  const eventSourceFactoryRef = useRef(eventSourceFactory);

  useEffect(() => {
    onTicketUpdateRef.current = onTicketUpdate;
    onTerminalStatusRef.current = onTerminalStatus;
    onReconnectRef.current = onReconnect;
    eventSourceFactoryRef.current = eventSourceFactory;
  }, [onTicketUpdate, onTerminalStatus, onReconnect, eventSourceFactory]);

  const closeConnection = useCallback(() => {
    if (eventSourceRef.current !== null) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    const token = typeof trackingToken === "string" ? trackingToken.trim() : "";

    // Do not connect if disabled or token is missing
    if (!enabled || !token) {
      return;
    }

    const factory = eventSourceFactoryRef.current;
    const hasEventSource =
      typeof factory === "function" ||
      (typeof window !== "undefined" && typeof window.EventSource !== "undefined");

    if (!hasEventSource) {
      // Gracefully fall back to polling when EventSource is not supported in the runtime
      return;
    }

    const url = `/api/realtime/tickets/${encodeURIComponent(token)}`;
    const es =
      typeof factory === "function"
        ? factory(url)
        : new window.EventSource(url);

    eventSourceRef.current = es;
    let hasConnectedOnce = false;

    const handleOpen = () => {
      const isReconnect = hasConnectedOnce;
      hasConnectedOnce = true;
      setIsConnected(true);
      setIsError(false);
      setError(null);

      if (isReconnect) {
        try {
          if (onReconnectRef.current) {
            void onReconnectRef.current();
          } else {
            void onTicketUpdateRef.current();
          }
        } catch (err) {
          console.error(
            "[useCustomerRealtime] Error executing onReconnect callback:",
            err,
          );
        }
      }
    };

    const handleError = () => {
      setIsConnected(false);
      setIsError(true);
      setError(new Error("SSE connection error"));
      // Native EventSource automatically attempts to reconnect on transient errors.
      // If the server closed with an error (e.g. 404 or 410), readyState becomes CLOSED.
      if (es.readyState === 2 /* EventSource.CLOSED */) {
        closeConnection();
      }
    };

    const handleTicketEvent = (event: MessageEvent) => {
      // Re-fetch authoritative state from PostgreSQL via REST
      try {
        void onTicketUpdateRef.current();
      } catch (err) {
        console.error("[useCustomerRealtime] Error executing onTicketUpdate:", err);
      }

      // If event signals a terminal transition, notify and close the stream
      if (
        event.type === "TICKET_COMPLETED" ||
        event.type === "TICKET_SKIPPED" ||
        event.type === "TICKET_CANCELLED"
      ) {
        try {
          onTerminalStatusRef.current?.(event.type);
        } catch (err) {
          console.error("[useCustomerRealtime] Error executing onTerminalStatus:", err);
        }
        closeConnection();
      }
    };

    es.addEventListener("open", handleOpen);
    es.addEventListener("error", handleError);

    for (const eventType of REALTIME_EVENT_TYPES) {
      es.addEventListener(eventType, handleTicketEvent as EventListener);
    }

    return () => {
      es.removeEventListener("open", handleOpen);
      es.removeEventListener("error", handleError);
      for (const eventType of REALTIME_EVENT_TYPES) {
        es.removeEventListener(eventType, handleTicketEvent as EventListener);
      }
      es.close();
      if (eventSourceRef.current === es) {
        eventSourceRef.current = null;
      }
      setIsConnected(false);
    };
  }, [trackingToken, enabled, closeConnection]);

  return {
    isConnected,
    isError,
    error,
    close: closeConnection,
  };
}

