"use client";

import { formatCreationDate } from "@/lib/formatters/date";
import type { ServiceItem } from "./types";

export interface ServiceCardProps {
  service: ServiceItem;
  isUpdating: boolean;
  isAnyUpdating: boolean;
  isDisabled: boolean;
  onEdit: (service: ServiceItem) => void;
  onToggleStatus: (service: ServiceItem) => void;
}

export function ServiceCard({
  service,
  isUpdating,
  isAnyUpdating,
  isDisabled,
  onEdit,
  onToggleStatus,
}: ServiceCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 flex flex-col justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-base font-semibold text-gray-900">
            {service.name}
          </h4>
          {service.isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
              Inactive
            </span>
          )}
        </div>
        {service.description ? (
          <p className="text-xs text-gray-600 line-clamp-2">
            {service.description}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">
            No description provided
          </p>
        )}
        <div className="flex items-center justify-between rounded-lg bg-gray-50/80 px-2.5 py-1.5 border border-gray-100 text-xs">
          <span className="font-medium text-gray-500">
            Admission Cutoff
          </span>
          <span className="font-semibold text-gray-800">
            {typeof service.admissionCutoffMinutes === "number"
              ? `${service.admissionCutoffMinutes} min before closing`
              : "Unlimited"}
          </span>
        </div>
        <span className="block font-mono text-xs text-gray-400">
          ID: {service.id}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
        <span>{formatCreationDate(service.createdAt)}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(service)}
            disabled={isAnyUpdating || isDisabled}
            aria-label={`Edit ${service.name}`}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onToggleStatus(service)}
            disabled={isAnyUpdating || isDisabled}
            aria-label={`${
              service.isActive ? "Deactivate" : "Activate"
            } ${service.name}`}
            className={`inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
              service.isActive
                ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-red-700 hover:border-red-200"
                : "border-gray-300 bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
            }`}
          >
            {isUpdating ? (
              <>
                <svg
                  className="mr-1.5 h-3.5 w-3.5 animate-spin text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {service.isActive
                  ? "Deactivating..."
                  : "Activating..."}
              </>
            ) : service.isActive ? (
              "Deactivate"
            ) : (
              "Activate"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

