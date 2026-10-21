export interface AppointmentStatusBadgeConfig {
  label: string;
  badgeClasses: string;
  dotClass: string;
}

export function getAppointmentStatusBadgeConfig(
  status: string,
): AppointmentStatusBadgeConfig {
  switch (status) {
    case "BOOKED":
      return {
        label: "Booked",
        badgeClasses: "bg-blue-50 text-blue-800 border-blue-200/80",
        dotClass: "bg-blue-600",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        badgeClasses: "bg-green-50 text-green-800 border-green-200/80",
        dotClass: "bg-green-600",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        badgeClasses: "bg-red-50 text-red-800 border-red-200/80",
        dotClass: "bg-red-500",
      };
    case "NO_SHOW":
      return {
        label: "No Show",
        badgeClasses: "bg-amber-50 text-amber-800 border-amber-200/80",
        dotClass: "bg-amber-500",
      };
    default:
      return {
        label: status || "Unknown",
        badgeClasses: "bg-gray-100 text-gray-800 border-gray-200",
        dotClass: "bg-gray-500",
      };
  }
}

export interface AppointmentStatusBadgeProps {
  status: string;
  className?: string;
}

export function AppointmentStatusBadge({
  status,
  className = "",
}: AppointmentStatusBadgeProps) {
  const config = getAppointmentStatusBadgeConfig(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.badgeClasses} ${className}`.trim()}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
