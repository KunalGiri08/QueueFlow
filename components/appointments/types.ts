export type AppointmentStatus =
  | "BOOKED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

export interface CustomerAppointment {
  id: string;
  userId: string;
  serviceId: string;
  scheduledAt: string;
  status: AppointmentStatus | string;
  createdAt: string;
  updatedAt: string;
  service: {
    id: string;
    name: string;
    organization: {
      id: string;
      name: string;
    };
  };
}

export interface BookAppointmentService {
  id: string;
  name: string;
}

export interface BookAppointmentOrganization {
  id: string;
  name: string;
}

export interface BookedAppointmentSuccessData {
  id: string;
  serviceId: string;
  scheduledAt: string;
}
