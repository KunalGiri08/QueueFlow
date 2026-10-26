"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { playTurnChime } from "@/lib/audio/notification-sound";
import { isTicketTerminal } from "@/lib/formatters/ticket";
import type { CustomerTicket } from "@/app/tickets/page";

export interface TurnNotificationItem {
  ticketId: string;
  ticketNumber: number;
  counter?: {
    name: string;
  } | null;
  queueName?: string;
  serviceName?: string;
  organizationName?: string;
}

export interface UseTicketTurnNotificationsOptions {
  /** Optional audio playback function for testing or dependency injection */
  playChime?: () => Promise<boolean>;
}

export interface UseTicketTurnNotificationsReturn {
  activeTurnNotifications: TurnNotificationItem[];
  dismissNotification: (ticketId: string) => void;
  isDismissed: (ticketId: string) => boolean;
}

interface TicketNotificationTracking {
  prevStatus: string;
  chimePlayed: boolean;
}

/**
 * Custom hook managing turn notifications for tickets on the authenticated customer dashboard.
 *
 * Responsibilities:
 * - Detects status transitions from non-CALLED (e.g. WAITING) to CALLED.
 * - Plays the audio chime exactly once per CALLED cycle.
 * - Suppresses audio chime on initial load if ticket is already CALLED.
 * - Suppresses audio chime on repeated polls or component rerenders while in CALLED.
 * - Provides per-ticket dismissal that persists across polls for the remainder of the CALLED cycle.
 * - Automatically resets dismissal and chime readiness when a ticket leaves CALLED.
 * - Cleans up tracking state when tickets reach terminal states or unmount.
 */
export function useTicketTurnNotifications(
  tickets: CustomerTicket[],
  options?: UseTicketTurnNotificationsOptions,
): UseTicketTurnNotificationsReturn {
  const playChime = options?.playChime ?? playTurnChime;

  // Set of ticket IDs whose notification banner has been explicitly dismissed in the current CALLED cycle
  const [dismissedTicketIds, setDismissedTicketIds] = useState<Set<string>>(
    () => new Set(),
  );

  // History tracking per ticket: previous status and whether chime was played for the current turn
  const historyRef = useRef<Record<string, TicketNotificationTracking>>({});

  // Flag indicating whether we have processed the initial batch of tickets
  const isInitialBatchProcessedRef = useRef<boolean>(false);

  useEffect(() => {
    // If no tickets yet (e.g. initial empty load or empty dashboard), reset tracking if empty
    if (tickets.length === 0) {
      if (Object.keys(historyRef.current).length > 0) {
        historyRef.current = {};
        setDismissedTicketIds(new Set());
      }
      return;
    }

    const currentHistory = historyRef.current;
    const currentTicketIds = new Set(tickets.map((t) => t.id));
    let shouldPlayChime = false;
    let dismissedChanged = false;
    const nextDismissed = new Set(dismissedTicketIds);

    const isInitialBatch = !isInitialBatchProcessedRef.current;
    isInitialBatchProcessedRef.current = true;

    for (const ticket of tickets) {
      const prev = currentHistory[ticket.id];

      if (!prev) {
        // First time seeing this ticket
        if (ticket.status === "CALLED") {
          // Already called on initial load: do not auto-play chime, but show banner
          currentHistory[ticket.id] = {
            prevStatus: ticket.status,
            chimePlayed: true,
          };
        } else {
          currentHistory[ticket.id] = {
            prevStatus: ticket.status,
            chimePlayed: false,
          };
        }
      } else {
        // Ticket was previously seen
        if (ticket.status === "CALLED") {
          if (prev.prevStatus !== "CALLED" && !prev.chimePlayed) {
            // Live transition to CALLED: trigger turn chime and banner
            shouldPlayChime = true;
            prev.chimePlayed = true;
            if (nextDismissed.has(ticket.id)) {
              nextDismissed.delete(ticket.id);
              dismissedChanged = true;
            }
          }
        } else {
          // Ticket is not in CALLED status
          if (prev.prevStatus === "CALLED") {
            // Transitioned away from CALLED: reset cycle state
            prev.chimePlayed = false;
            if (nextDismissed.has(ticket.id)) {
              nextDismissed.delete(ticket.id);
              dismissedChanged = true;
            }
          }
        }
        prev.prevStatus = ticket.status;
      }

      // Cleanup terminal tickets
      if (isTicketTerminal(ticket.status)) {
        delete currentHistory[ticket.id];
        if (nextDismissed.has(ticket.id)) {
          nextDismissed.delete(ticket.id);
          dismissedChanged = true;
        }
      }
    }

    // Prune removed tickets from historyRef and nextDismissed
    for (const trackedId of Object.keys(currentHistory)) {
      if (!currentTicketIds.has(trackedId)) {
        delete currentHistory[trackedId];
        if (nextDismissed.has(trackedId)) {
          nextDismissed.delete(trackedId);
          dismissedChanged = true;
        }
      }
    }

    if (dismissedChanged) {
      setDismissedTicketIds(nextDismissed);
    }

    if (shouldPlayChime && !isInitialBatch) {
      void playChime().catch(() => {});
    }
  }, [tickets, playChime, dismissedTicketIds]);

  const dismissNotification = (ticketId: string) => {
    setDismissedTicketIds((prev) => {
      if (prev.has(ticketId)) return prev;
      const next = new Set(prev);
      next.add(ticketId);
      return next;
    });
  };

  const isDismissed = (ticketId: string): boolean => {
    return dismissedTicketIds.has(ticketId);
  };

  // Derive active banners for currently CALLED tickets that haven't been dismissed
  const activeTurnNotifications = useMemo<TurnNotificationItem[]>(() => {
    return tickets
      .filter(
        (ticket) =>
          ticket.status === "CALLED" && !dismissedTicketIds.has(ticket.id),
      )
      .map((ticket) => ({
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        counter: ticket.counter ?? null,
        queueName: ticket.queue.name,
        serviceName: ticket.queue.service.name,
        organizationName: ticket.queue.service.organization.name,
      }));
  }, [tickets, dismissedTicketIds]);

  return {
    activeTurnNotifications,
    dismissNotification,
    isDismissed,
  };
}
