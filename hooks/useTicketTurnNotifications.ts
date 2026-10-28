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

  // Derive the IDs of currently CALLED tickets
  const activeCalledIds = useMemo(() => {
    return new Set(
      tickets.filter((t) => t.status === "CALLED").map((t) => t.id),
    );
  }, [tickets]);

  // Adjust state during render: prune dismissed IDs for tickets that are no longer in CALLED status
  let hasStaleDismissed = false;
  for (const id of dismissedTicketIds) {
    if (!activeCalledIds.has(id)) {
      hasStaleDismissed = true;
      break;
    }
  }

  if (hasStaleDismissed) {
    const nextDismissed = new Set(
      Array.from(dismissedTicketIds).filter((id) => activeCalledIds.has(id)),
    );
    setDismissedTicketIds(nextDismissed);
  }

  useEffect(() => {
    // If no tickets yet (e.g. initial empty load or empty dashboard), reset tracking if empty
    if (tickets.length === 0) {
      if (Object.keys(historyRef.current).length > 0) {
        historyRef.current = {};
      }
      return;
    }

    const currentHistory = historyRef.current;
    const currentTicketIds = new Set(tickets.map((t) => t.id));
    let shouldPlayChime = false;

    const isInitialBatch = !isInitialBatchProcessedRef.current;
    isInitialBatchProcessedRef.current = true;

    for (const ticket of tickets) {
      const prev = currentHistory[ticket.id];

      if (!prev) {
        // First time seeing this ticket
        currentHistory[ticket.id] = {
          prevStatus: ticket.status,
          chimePlayed: ticket.status === "CALLED",
        };
      } else {
        // Ticket was previously seen
        if (ticket.status === "CALLED") {
          if (prev.prevStatus !== "CALLED" && !prev.chimePlayed) {
            // Live transition to CALLED: trigger turn chime and banner
            shouldPlayChime = true;
            prev.chimePlayed = true;
          }
        } else {
          // Ticket is not in CALLED status: reset chime readiness for next cycle
          if (prev.prevStatus === "CALLED") {
            prev.chimePlayed = false;
          }
        }
        prev.prevStatus = ticket.status;
      }

      // Cleanup terminal tickets
      if (isTicketTerminal(ticket.status)) {
        delete currentHistory[ticket.id];
      }
    }

    // Prune removed tickets from historyRef
    for (const trackedId of Object.keys(currentHistory)) {
      if (!currentTicketIds.has(trackedId)) {
        delete currentHistory[trackedId];
      }
    }

    if (shouldPlayChime && !isInitialBatch) {
      void playChime().catch(() => {});
    }
  }, [tickets, playChime]);

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
