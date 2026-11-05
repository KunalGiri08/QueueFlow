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
  /** Custom fetch implementation (primarily for unit testing) */
  fetchFn?: typeof fetch;
}

export interface UseCustomerRealtimeReturn {
  isConnected: boolean;
  isError: boolean;
  error: Error | null;
  close: () => void;
}

export interface ParsedSSEMessage {
  event: string;
  data: string;
}

/**
 * Parses an SSE text chunk into completed event messages and incomplete trailing buffer.
 * Correctly handles:
 * - Chunk boundaries splitting an event
 * - Multiple events per chunk
 * - \r\n and \n line endings
 * - SSE comment / heartbeat lines (: comment)
 * - data: fields (including multiline data)
 */
export function parseSSEMessages(buffer: string): {
  messages: ParsedSSEMessage[];
  remaining: string;
} {
  const normalized = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split("\n\n");
  const remaining = blocks.pop() ?? "";
  const messages: ParsedSSEMessage[] = [];

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventType = "message";
    const dataLines: string[] = [];

    const lines = block.split("\n");
    for (const line of lines) {
      if (line.startsWith(":")) {
        // SSE Comment / heartbeat - ignore
        continue;
      }
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (dataLines.length > 0) {
      messages.push({
        event: eventType,
        data: dataLines.join("\n"),
      });
    }
  }

  return { messages, remaining };
}

export function useCustomerRealtime({
  trackingToken,
  enabled = true,
  onTicketUpdate,
  onTerminalStatus,
  onReconnect,
  fetchFn,
}: UseCustomerRealtimeOptions): UseCustomerRealtimeReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedOnceRef = useRef(false);
  const retryCountRef = useRef(0);

  const onTicketUpdateRef = useRef(onTicketUpdate);
  const onTerminalStatusRef = useRef(onTerminalStatus);
  const onReconnectRef = useRef(onReconnect);
  const fetchFnRef = useRef(fetchFn);

  useEffect(() => {
    onTicketUpdateRef.current = onTicketUpdate;
    onTerminalStatusRef.current = onTerminalStatus;
    onReconnectRef.current = onReconnect;
    fetchFnRef.current = fetchFn;
  }, [onTicketUpdate, onTerminalStatus, onReconnect, fetchFn]);

  const close = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    abortControllerRef.current?.abort();
    if (readerRef.current !== null) {
      void readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    const token = typeof trackingToken === "string" ? trackingToken.trim() : "";

    // Do not connect if disabled or token is missing
    if (!enabled || !token) {
      return;
    }

    let isEffectCancelled = false;
    let isTerminal = false;
    let shouldRetry = false;

    async function startStream() {
      if (isEffectCancelled || isTerminal) return;
      shouldRetry = false;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const fetchImpl =
          fetchFnRef.current ??
          (typeof window !== "undefined" ? window.fetch.bind(window) : fetch);

        // Tracking token is sent strictly in the POST JSON body; NEVER in the URL
        const response = await fetchImpl("/api/realtime/tickets/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
          },
          body: JSON.stringify({ trackingToken: token }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (isEffectCancelled || controller.signal.aborted) {
          return;
        }

        // Non-recoverable HTTP errors (400, 401, 403, 404, 410)
        // Never retry loops for invalid credentials or client errors
        if (!response.ok) {
          setIsConnected(false);
          setIsError(true);
          setError(
            new Error(`SSE connection failed with HTTP status ${response.status}`),
          );
          shouldRetry = false;
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          setIsConnected(false);
          setIsError(true);
          setError(
            new Error(
              `Expected text/event-stream content-type but received ${contentType}`,
            ),
          );
          shouldRetry = false;
          return;
        }

        if (!response.body) {
          throw new Error("Response body is not readable");
        }

        // Active connection established: network disconnects after this point are recoverable
        shouldRetry = true;

        const isReconnect = hasConnectedOnceRef.current;
        hasConnectedOnceRef.current = true;
        retryCountRef.current = 0;
        setIsConnected(true);
        setIsError(false);
        setError(null);

        // Invoke onReconnect strictly upon successful reconnection, NOT on initial connection
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

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (!isEffectCancelled && !controller.signal.aborted && !isTerminal) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const { messages, remaining } = parseSSEMessages(buffer);
          buffer = remaining;

          for (const msg of messages) {
            // Invoke authoritative refetch callback
            try {
              void onTicketUpdateRef.current();
            } catch (err) {
              console.error(
                "[useCustomerRealtime] Error executing onTicketUpdate:",
                err,
              );
            }

            // If terminal event received, close stream and stop retrying
            if (
              msg.event === "TICKET_COMPLETED" ||
              msg.event === "TICKET_SKIPPED" ||
              msg.event === "TICKET_CANCELLED"
            ) {
              isTerminal = true;
              shouldRetry = false;
              try {
                onTerminalStatusRef.current?.(msg.event);
              } catch (err) {
                console.error(
                  "[useCustomerRealtime] Error executing onTerminalStatus:",
                  err,
                );
              }
              setIsConnected(false);
              await reader.cancel().catch(() => {});
              return;
            }
          }
        }
      } catch (err) {
        if (isEffectCancelled || controller.signal.aborted) {
          return;
        }

        // Network or fetch failures are recoverable
        shouldRetry = true;
        setIsConnected(false);
        setIsError(true);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (readerRef.current !== null) {
          try {
            readerRef.current.releaseLock?.();
          } catch {
            // ignore lock release errors
          }
          readerRef.current = null;
        }

        // Schedule bounded retry only on recoverable network failures
        if (
          shouldRetry &&
          !isEffectCancelled &&
          !isTerminal &&
          !controller.signal.aborted
        ) {
          setIsConnected(false);
          const backoff = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            15000,
          );
          retryCountRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => {
            void startStream();
          }, backoff);
        }
      }
    }

    void startStream();

    return () => {
      isEffectCancelled = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      abortControllerRef.current?.abort();
      if (readerRef.current !== null) {
        void readerRef.current.cancel().catch(() => {});
        readerRef.current = null;
      }
      setIsConnected(false);
    };
  }, [trackingToken, enabled]);

  return {
    isConnected,
    isError,
    error,
    close,
  };
}
