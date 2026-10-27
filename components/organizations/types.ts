export interface PublicQueue {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface PublicService {
  id: string;
  name: string;
  description: string | null;
  queues: PublicQueue[];
}

export interface OrganizationServicesData {
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  services: PublicService[];
}

export interface QueueAvailabilityData {
  id: string;
  name: string;
  isActive: boolean;
  currentlyServing: number | null;
  waitingCount: number;
  estimatedWaitMinutes: number | null;
  maxWaitingTickets: number | null;
  maxDailyTickets: number | null;
  dailyCount: number;
  isWaitingCapacityFull: boolean;
  isDailyQuotaReached: boolean;
  isJoinable: boolean;
  unavailabilityReason: string | null;
  unavailabilityCode: string | null;
  organizationStatus: {
    isOpen: boolean;
    reason: string;
    message: string | null;
  } | null;
  admissionStatus: {
    isAdmitted: boolean;
    reason: string;
    message: string | null;
    cutoffMinutes: number | null;
    effectiveCutoffTime: string | null;
  } | null;
}

export interface AdmissionErrorPayload {
  error?: string;
  code?: string;
  reason?: string;
  message?: string;
}

export interface QueueAvailabilityEntry {
  data: QueueAvailabilityData | null;
  isLoading: boolean;
  error: string | null;
}
