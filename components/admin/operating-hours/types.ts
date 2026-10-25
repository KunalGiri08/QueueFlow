export interface ScheduleIntervalItem {
  id: string;
  organizationId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClosureItem {
  id: string;
  organizationId: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DayOfWeekConfig {
  day: number;
  name: string;
  short: string;
}

export const DAYS_OF_WEEK: DayOfWeekConfig[] = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
  { day: 6, name: "Saturday", short: "Sat" },
  { day: 0, name: "Sunday", short: "Sun" },
];

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
