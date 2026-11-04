export interface QueueItem {
  id: string;
  name: string;
  serviceId: string;
  nextTicketNumber: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  maxWaitingTickets?: number | null;
  maxDailyTickets?: number | null;
}

export interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  isActive?: boolean;
}

export interface QueueManagementProps {
  organizationId: string;
}

export interface CreateQueuePayload {
  name: string;
  maxWaitingTickets?: number;
  maxDailyTickets?: number;
}

export interface UpdateQueuePayload {
  name: string;
  maxWaitingTickets: number | null;
  maxDailyTickets: number | null;
}

