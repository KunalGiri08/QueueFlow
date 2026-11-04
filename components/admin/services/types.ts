export interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  admissionCutoffMinutes?: number | null;
}

