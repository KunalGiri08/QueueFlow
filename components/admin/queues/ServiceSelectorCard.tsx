"use client";

import type { ServiceOption } from "./types";

export interface ServiceSelectorCardProps {
  services: ServiceOption[];
  selectedServiceId: string | null;
  isLoading: boolean;
  error: string | null;
  isDisabled?: boolean;
  onSelectService: (serviceId: string) => void;
  onRetry: () => void;
}

function ServicesSkeleton() {
  return (
    <div
      aria-label="Loading service categories for queue management"
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse space-y-3"
    >
      <div className="h-4 w-40 rounded bg-gray-200" />
      <div className="h-9 w-full sm:w-80 rounded-lg bg-gray-100" />
    </div>
  );
}

/**
 * Service category selector component for Queue Management.
 * Manages loading skeleton, error states with retry, empty state,
 * and the active service dropdown with inactive tags and descriptions.
 */
export function ServiceSelectorCard({
  services,
  selectedServiceId,
  isLoading,
  error,
  isDisabled = false,
  onSelectService,
  onRetry,
}: ServiceSelectorCardProps) {
  if (isLoading) {
    return <ServicesSkeleton />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
      >
        <p className="text-sm font-medium">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Retry Loading Service Categories
        </button>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z"
            />
          </svg>
        </div>
        <h4 className="mt-3 text-sm font-semibold text-gray-900">
          No Service Categories Configured
        </h4>
        <p className="mt-1 text-xs text-gray-500 max-w-md mx-auto">
          Queues belong to service categories. Add at least one service category in the Service Categories section above before creating queues.
        </p>
      </div>
    );
  }

  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label
            htmlFor="queue-service-select"
            className="block text-xs font-semibold uppercase tracking-wider text-gray-700"
          >
            Select Service Category
          </label>
          <p className="mt-0.5 text-xs text-gray-500">
            Choose a service to manage its active customer queues.
          </p>
        </div>

        <div className="w-full sm:w-72">
          <select
            id="queue-service-select"
            value={selectedServiceId || ""}
            onChange={(e) => onSelectService(e.target.value)}
            disabled={isDisabled}
            className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
          >
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}{service.isActive === false ? " (Inactive)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedService?.description && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500 italic">
            &ldquo;{selectedService.description}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

