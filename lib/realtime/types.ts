/**
 * Real-time event catalog and strongly typed envelopes for QueueFlow.
 * Enforces minimal payloads and separation between customer-safe data and staff/admin data.
 */

export type RealtimeEventType =
  | "TICKET_CREATED"
  | "TICKET_CALLED"
  | "TICKET_SERVING"
  | "TICKET_COMPLETED"
  | "TICKET_SKIPPED"
  | "TICKET_CANCELLED"
  | "QUEUE_STATUS_CHANGED"
  | "QUEUE_INVALIDATED";

// ============================================================================
// Channel Naming Helpers
// ============================================================================

export function customerTicketChannel(trackingToken: string): string {
  return `ticket:${trackingToken.trim()}`;
}

export function customerQueueChannel(queueId: string): string {
  return `customer:queue:${queueId.trim()}`;
}

export function staffOrgChannel(organizationId: string): string {
  return `org:${organizationId.trim()}`;
}

export function staffQueueChannel(queueId: string): string {
  return `queue:${queueId.trim()}`;
}

// ============================================================================
// Customer Real-Time Polling Intervals (Phase 4)
// ============================================================================

export const WAITING_CONNECTED_SAFETY_POLL_INTERVAL_MS = 30000;
export const WAITING_DISCONNECTED_POLL_INTERVAL_MS = 10000;
export const CALLED_FALLBACK_POLL_INTERVAL_MS = 10000;

// ============================================================================
// Customer-Safe Payloads (strictly sanitized; zero PII or internal IDs)
// ============================================================================

export interface CustomerTicketCalledPayload {
  ticketNumber: number;
  status: "CALLED";
  counterName: string;
}

export interface CustomerTicketServingPayload {
  ticketNumber: number;
  status: "SERVING";
  counterName: string;
}

export interface CustomerTicketCompletedPayload {
  ticketNumber: number;
  status: "COMPLETED";
}

export interface CustomerTicketSkippedPayload {
  ticketNumber: number;
  status: "SKIPPED";
}

export interface CustomerTicketCancelledPayload {
  ticketNumber: number;
  status: "CANCELLED";
}

export interface CustomerQueueStatusPayload {
  queueId: string;
  isActive: boolean;
}

export interface CustomerQueueInvalidatedPayload {
  queueId: string;
  reason?: string;
  timestamp: number;
}

// ============================================================================
// Staff / Admin Payloads (operational data for counters & queues)
// ============================================================================

export interface StaffTicketCreatedPayload {
  ticketId: string;
  ticketNumber: number;
  queueId: string;
  waitingCount: number;
}

export interface StaffTicketCalledPayload {
  ticketId: string;
  ticketNumber: number;
  queueId: string;
  status: "CALLED";
  counterId: string;
  counterName: string;
  staffId: string;
  calledAt: string;
}

export interface StaffTicketServingPayload {
  ticketId: string;
  ticketNumber: number;
  queueId: string;
  status: "SERVING";
  servedAt: string;
}

export interface StaffTicketCompletedPayload {
  ticketId: string;
  ticketNumber: number;
  queueId: string;
  status: "COMPLETED";
  completedAt: string;
}

export interface StaffTicketSkippedPayload {
  ticketId: string;
  ticketNumber: number;
  queueId: string;
  status: "SKIPPED";
  completedAt: string;
}

export interface StaffTicketCancelledPayload {
  ticketId: string;
  ticketNumber: number;
  queueId: string;
  status: "CANCELLED";
}

export interface StaffQueueStatusPayload {
  queueId: string;
  isActive: boolean;
  maxWaitingTickets: number | null;
  maxDailyTickets: number | null;
}

// ============================================================================
// Generic Realtime Envelope
// ============================================================================

export interface RealtimeEnvelope<TPayload = unknown> {
  type: RealtimeEventType;
  channel: string;
  timestamp: string; // ISO 8601 string
  payload: TPayload;
}

/**
 * Convenience helper to create a strongly typed RealtimeEnvelope.
 */
export function createRealtimeEnvelope<T>(
  type: RealtimeEventType,
  channel: string,
  payload: T,
): RealtimeEnvelope<T> {
  return {
    type,
    channel,
    timestamp: new Date().toISOString(),
    payload,
  };
}

