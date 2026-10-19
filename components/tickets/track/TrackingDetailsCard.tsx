export interface TrackingDetailsCardProps {
  organizationName: string;
  serviceName: string;
  queueName: string;
  counter?: {
    name: string;
  } | null;
}

/**
 * Summary card presenting organizational, queue, service, and counter details.
 */
export function TrackingDetailsCard({
  organizationName,
  serviceName,
  queueName,
  counter,
}: TrackingDetailsCardProps) {
  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
        Queue Details
      </h2>
      <dl className="divide-y divide-gray-100 text-sm">
        <div className="flex justify-between py-2.5">
          <dt className="text-gray-500">Organization</dt>
          <dd className="font-medium text-gray-900">{organizationName}</dd>
        </div>
        <div className="flex justify-between py-2.5">
          <dt className="text-gray-500">Service</dt>
          <dd className="font-medium text-gray-900">{serviceName}</dd>
        </div>
        <div className="flex justify-between py-2.5">
          <dt className="text-gray-500">Queue</dt>
          <dd className="font-medium text-gray-900">{queueName}</dd>
        </div>
        {counter && (
          <div className="flex justify-between py-2.5">
            <dt className="text-gray-500">Counter</dt>
            <dd className="font-medium text-gray-900">{counter.name}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
