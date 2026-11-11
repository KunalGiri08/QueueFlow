"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { parseSSEMessages } from "./useCustomerRealtime";

export interface UseStaffRealtimeOptions {
  /** Selected organization ID */
  orgId: string | null;
  /** Authenticated staff operator user ID */
  staffId: string | null;
  /** Optional queue IDs filter */
  queueIds?: string[];
  /** Whether the real-time stream should be active */
  enabled?: boolean;
  /** Invoked when a queue invalidation event arrives */
  onQueueInvalidated: (event?: {
    queueId?: string;
    reason?: string;
  }) => void | Promise<void>;
  /** Optional callback fired when SSE reconnects after connection drop */
  onReconnect?: () => void | Promise<void>;
  /** Custom fetch implementation (primarily for unit testing) */
  fetchFn?: typeof fetch;
}

export interface UseStaffRealtimeReturn {
  isConnected: boolean;
  isError: boolean;
  error: Error | null;
  close: () => void;
}

const THROTTLE_REFETCH_MS = 250;

export function useStaffRealtime({
  orgId,
  staffId,
  queueIds,
  enabled = true,
  onQueueInvalidated,
  onReconnect,
  fetchFn,
}: UseStaffRealtimeOptions): UseStaffRealtimeReturn {
  const [isConnected, setIsConnected] = useState(false);
  const isConnectedRef = useRef(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastRefetchTimeRef = useRef<number>(0);
  const hasConnectedOnceRef = useRef(false);
  const retryCountRef = useRef(0);
  const latestPayloadRef = useRef<
    { queueId?: string; reason?: string } | undefined
  >(undefined);

  const onQueueInvalidatedRef = useRef(onQueueInvalidated);
  const onReconnectRef = useRef(onReconnect);
  const fetchFnRef = useRef(fetchFn);
  const queueIdsRef = useRef(queueIds);

  useEffect(() => {
    onQueueInvalidatedRef.current = onQueueInvalidated;
    onReconnectRef.current = onReconnect;
    fetchFnRef.current = fetchFn;
    queueIdsRef.current = queueIds;
  }, [onQueueInvalidated, onReconnect, fetchFn, queueIds]);

  const setConnectedState = useCallback((val: boolean) => {
    isConnectedRef.current = val;
    setIsConnected(val);
  }, []);

  const triggerThrottledRefetch = useCallback(
    (eventPayload?: { queueId?: string; reason?: string }) => {
      latestPayloadRef.current = eventPayload;
      const now = Date.now();
      const elapsed = now - lastRefetchTimeRef.current;

      if (elapsed >= THROTTLE_REFETCH_MS) {
        if (pendingRefetchTimerRef.current !== null) {
          clearTimeout(pendingRefetchTimerRef.current);
          pendingRefetchTimerRef.current = null;
        }
        lastRefetchTimeRef.current = now;
        try {
          void onQueueInvalidatedRef.current(latestPayloadRef.current);
        } catch (err) {
          console.error(
            "[useStaffRealtime] Error executing onQueueInvalidated:",
            err,
          );
        }
      } else if (pendingRefetchTimerRef.current === null) {
        const remaining = THROTTLE_REFETCH_MS - elapsed;
        pendingRefetchTimerRef.current = setTimeout(() => {
          pendingRefetchTimerRef.current = null;
          lastRefetchTimeRef.current = Date.now();
          try {
            void onQueueInvalidatedRef.current(latestPayloadRef.current);
          } catch (err) {
            console.error(
              "[useStaffRealtime] Error executing onQueueInvalidated:",
              err,
            );
          }
        }, remaining);
      }
    },
    [],
  );

  const close = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pendingRefetchTimerRef.current !== null) {
      clearTimeout(pendingRefetchTimerRef.current);
      pendingRefetchTimerRef.current = null;
    }
    abortControllerRef.current?.abort();
    if (readerRef.current !== null) {
      void readerRef.current.cancel().catch(() => {});
      readerRef.current = null;
    }
    setConnectedState(false);
  }, [setConnectedState]);

  const queueIdsKey = Array.isArray(queueIds) ? queueIds.join(",") : "";

  useEffect(() => {
    const trimmedOrg = typeof orgId === "string" ? orgId.trim() : "";
    const trimmedStaff = typeof staffId === "string" ? staffId.trim() : "";

    // Do not connect without valid organization and staff context
    if (!enabled || !trimmedOrg || !trimmedStaff) {
      return;
    }

    let isEffectCancelled = false;
    let shouldRetry = false;

    async function startStream() {
      if (isEffectCancelled) return;
      shouldRetry = false;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const fetchImpl =
          fetchFnRef.current ??
          (typeof window !== "undefined" ? window.fetch.bind(window) : fetch);

        const response = await fetchImpl("/api/realtime/staff/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            organizationId: trimmedOrg,
            staffId: trimmedStaff,
            queueIds: queueIdsRef.current,
          }),
          signal: controller.signal,
          cache: "no-store",
        });

        if (isEffectCancelled || controller.signal.aborted) {
          return;
        }

        // Non-recoverable client/auth errors (400, 401, 403, 404)
        if (!response.ok) {
          setConnectedState(false);
          setIsError(true);
          setError(
            new Error(
              `Staff SSE connection failed with HTTP status ${response.status}`,
            ),
          );
          shouldRetry = false;
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          setConnectedState(false);
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

        shouldRetry = true;

        const isReconnect = hasConnectedOnceRef.current;
        hasConnectedOnceRef.current = true;
        retryCountRef.current = 0;
        setConnectedState(true);
        setIsError(false);
        setError(null);

        if (isReconnect) {
          try {
            if (onReconnectRef.current) {
              void onReconnectRef.current();
            } else {
              void onQueueInvalidatedRef.current();
            }
          } catch (err) {
            console.error(
              "[useStaffRealtime] Error executing onReconnect callback:",
              err,
            );
          }
        }

        const reader = response.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (!isEffectCancelled && !controller.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const { messages, remaining } = parseSSEMessages(buffer);
          buffer = remaining;

          for (const msg of messages) {
            if (
              msg.event === "QUEUE_INVALIDATED" ||
              msg.event === "QUEUE_STATUS_CHANGED" ||
              msg.event === "TICKET_CREATED"
            ) {
              let payload: { queueId?: string; reason?: string } | undefined;
              try {
                payload = JSON.parse(msg.data);
              } catch {
                payload = undefined;
              }
              triggerThrottledRefetch(payload);
            }
          }
        }
      } catch (err) {
        if (isEffectCancelled || controller.signal.aborted) {
          return;
        }

        shouldRetry = true;
        setConnectedState(false);
        setIsError(true);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (readerRef.current !== null) {
          await readerRef.current.cancel().catch(() => {});
          readerRef.current = null;
        }

        // Schedule reconnection with bounded exponential backoff
        if (!isEffectCancelled && shouldRetry) {
          const backoffDelay = Math.min(
            1000 * Math.pow(2, retryCountRef.current),
            10000,
          );
          retryCountRef.current += 1;

          reconnectTimerRef.current = setTimeout(() => {
            if (!isEffectCancelled) {
              void startStream();
            }
          }, backoffDelay);
        }
      }
    }

    void startStream();

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible" && !isConnectedRef.current) {
        // Trigger reconnection attempt when tab returns to foreground if disconnected
        if (reconnectTimerRef.current !== null) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        void startStream();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      isEffectCancelled = true;
      close();
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
      }
    };
  }, [
    orgId,
    staffId,
    queueIdsKey,
    enabled,
    close,
    setConnectedState,
    triggerThrottledRefetch,
  ]);

  return {
    isConnected,
    isError,
    error,
    close,
  };
}
