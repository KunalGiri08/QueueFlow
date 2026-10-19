import { StatusBadge } from "@/components/shared/StatusBadge";

export interface TrackingHeroCardProps {
  ticketNumber: number;
  status: string;
  statusMessage: string;
  organizationName: string;
  serviceName: string;
  counter?: {
    name: string;
  } | null;
}

/**
 * Hero card presenting the customer's ticket number, status badge, status callout,
 * and assigned service counter.
 */
export function TrackingHeroCard({
  ticketNumber,
  status,
  statusMessage,
  organizationName,
  serviceName,
  counter,
}: TrackingHeroCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-medium text-gray-500">
        {organizationName} &bull; {serviceName}
      </p>

      <div className="mt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Your Ticket Number
        </span>
        <h1 className="mt-1 text-6xl font-black tracking-tight text-gray-900 sm:text-7xl">
          #{ticketNumber}
        </h1>
      </div>

      <div className="mt-5 flex justify-center">
        <StatusBadge status={status} size="lg" audience="customer" />
      </div>

      <p className="mt-3 text-sm text-gray-600">{statusMessage}</p>

      {counter && (
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/80 p-3.5 text-center">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
            Assigned Counter
          </span>
          <p className="mt-0.5 text-base font-bold text-blue-900">
            {counter.name}
          </p>
        </div>
      )}
    </div>
  );
}
