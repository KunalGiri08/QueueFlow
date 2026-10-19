import {
  getTicketStatusBadgeConfig,
  type StatusAudience,
} from "@/lib/formatters/ticket";

export interface StatusBadgeProps {
  status: string;
  audience?: StatusAudience;
  size?: "default" | "lg";
  className?: string;
}

/**
 * Reusable ticket status badge displaying status pill styling and animated indicator dot.
 * Encapsulates canonical color schemes and audience-appropriate labels.
 */
export function StatusBadge({
  status,
  audience = "customer",
  size = "default",
  className = "",
}: StatusBadgeProps) {
  const config = getTicketStatusBadgeConfig(status, audience);
  const sizeClasses =
    size === "lg" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${sizeClasses} ${config.badgeClasses} ${className}`.trim()}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`}
        aria-hidden="true"
      />
      {config.label}
    </span>
  );
}
