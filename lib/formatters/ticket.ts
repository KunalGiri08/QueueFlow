/**
 * Canonical ticket status presentation configuration and helpers for QueueFlow.
 * Unifies status badge labeling, visual styling, customer tracking messages, and status lifecycles.
 */

export type TicketStatus =
  | "WAITING"
  | "CALLED"
  | "SERVING"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";

export type StatusAudience = "customer" | "staff";

export interface TicketStatusBadgeConfig {
  label: string;
  badgeClasses: string;
  dotClass: string;
  message: string;
}

export const ACTIVE_TICKET_STATUSES = Object.freeze([
  "WAITING",
  "CALLED",
  "SERVING",
] as const);

export const TERMINAL_TICKET_STATUSES = Object.freeze([
  "COMPLETED",
  "SKIPPED",
  "CANCELLED",
] as const);

/**
 * Checks if a ticket status represents an active waiting or in-progress state.
 */
export function isTicketActive(status: string): boolean {
  return (ACTIVE_TICKET_STATUSES as readonly string[]).includes(status);
}

/**
 * Checks if a list of customer tickets contains at least one active ticket.
 */
export function hasActiveCustomerTickets(
  tickets: Array<{ status: string }>,
): boolean {
  return tickets.some((t) => isTicketActive(t.status));
}

/**
 * Checks if a ticket status is in a terminal state (cannot transition further).
 */
export function isTicketTerminal(status: string): boolean {
  return (TERMINAL_TICKET_STATUSES as readonly string[]).includes(status);
}

/**
 * Returns the canonical display configuration for a given ticket status.
 *
 * Audience differences:
 * - "customer": CALLED uses "Ticket Called" for clarity on customer ticket pages.
 * - "staff": CALLED uses "Called" for compact console density.
 */
export function getTicketStatusBadgeConfig(
  status: string,
  audience: StatusAudience = "customer",
): TicketStatusBadgeConfig {
  switch (status) {
    case "WAITING":
      return {
        label: "Waiting in Line",
        badgeClasses: "bg-amber-50 text-amber-800 border-amber-200/80",
        dotClass: "bg-amber-500",
        message:
          "You are currently in line. Please keep this page open to watch your position.",
      };

    case "CALLED":
      return {
        label: audience === "staff" ? "Called" : "Ticket Called",
        badgeClasses: "bg-blue-50 text-blue-800 border-blue-200/80 animate-pulse",
        dotClass: "bg-blue-600",
        message: "Your ticket has been called! Please head to the counter.",
      };

    case "SERVING":
      return {
        label: "Now Serving",
        badgeClasses: "bg-green-50 text-green-800 border-green-200/80",
        dotClass: "bg-green-600",
        message: "You are currently being served.",
      };

    case "COMPLETED":
      return {
        label: "Completed",
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
        message: "This service session has been completed. Thank you!",
      };

    case "SKIPPED":
      return {
        label: "Skipped",
        badgeClasses: "bg-orange-50 text-orange-800 border-orange-200/80",
        dotClass: "bg-orange-500",
        message:
          "Your ticket was skipped. Please speak with staff if you need assistance.",
      };

    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClasses: "bg-red-50 text-red-800 border-red-200/80",
        dotClass: "bg-red-500",
        message: "This ticket has been cancelled.",
      };

    default:
      return {
        label: status || "Unknown",
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
        message: status ? `Ticket status: ${status}` : "Ticket status unavailable.",
      };
  }
}
