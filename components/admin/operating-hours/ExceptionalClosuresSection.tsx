"use client";

import { formatDate } from "@/lib/formatters/date";
import {
  getTodayIsoDate,
  type ClosureItem,
} from "./types";

export interface ExceptionalClosuresSectionProps {
  closures: ClosureItem[];
  error: string | null;
  deletingClosureId: string | null;
  onRetry: () => void;
  onOpenAddClosure: () => void;
  onOpenEditClosure: (closure: ClosureItem) => void;
  onDeleteClosure: (closure: ClosureItem) => void;
}

export function ExceptionalClosuresSection({
  closures,
  error,
  deletingClosureId,
  onRetry,
  onOpenAddClosure,
  onOpenEditClosure,
  onDeleteClosure,
}: ExceptionalClosuresSectionProps) {
  const todayIso = getTodayIsoDate();

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-gray-700"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
              />
            </svg>
            <h3 className="text-lg font-bold text-gray-900">
              Exceptional Closures & Holidays
            </h3>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Schedule specific holiday or maintenance dates when the entire organization
            will be closed. Closures take immediate precedence over regular weekly hours.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenAddClosure}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3.5 py-2 text-xs sm:text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 active:scale-[0.98] shrink-0"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Closure
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800"
        >
          <p className="text-sm font-medium">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-black"
          >
            Retry Closures
          </button>
        </div>
      ) : closures.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-200 py-10 text-center">
          <svg
            className="mx-auto h-8 w-8 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-gray-700">
            No exceptional closures scheduled
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Add upcoming holidays or emergency closure dates using the button above.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left text-xs sm:text-sm">
              <thead className="bg-gray-50 text-gray-600 font-semibold">
                <tr>
                  <th scope="col" className="px-4 py-3 sm:px-6">
                    Date Range
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6">
                    Reason / Note
                  </th>
                  <th scope="col" className="px-4 py-3 sm:px-6 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {closures.map((closure) => {
                  const isDeleting = deletingClosureId === closure.id;
                  const isSingleDay = closure.startDate === closure.endDate;
                  const isActiveNow =
                    todayIso >= closure.startDate && todayIso <= closure.endDate;
                  const isPast = todayIso > closure.endDate;

                  return (
                    <tr key={closure.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3.5 sm:px-6 whitespace-nowrap font-medium text-gray-900 font-mono text-xs">
                        {isSingleDay ? (
                          <span>{closure.startDate}</span>
                        ) : (
                          <span>
                            {closure.startDate} &rarr; {closure.endDate}
                          </span>
                        )}
                        <span className="block text-[11px] font-sans font-normal text-gray-500 mt-0.5">
                          {isSingleDay
                            ? formatDate(closure.startDate)
                            : `${formatDate(closure.startDate)} - ${formatDate(
                                closure.endDate,
                              )}`}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 sm:px-6 whitespace-nowrap">
                        {isActiveNow ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700 border border-red-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
                            Active Now (Closed)
                          </span>
                        ) : isPast ? (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                            Past
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                            Upcoming
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 sm:px-6 text-gray-700">
                        {closure.reason ? (
                          <span>{closure.reason}</span>
                        ) : (
                          <span className="italic text-gray-400">
                            No reason specified
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 sm:px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenEditClosure(closure)}
                            disabled={isDeleting}
                            aria-label={`Edit closure for ${closure.startDate}`}
                            className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteClosure(closure)}
                            disabled={isDeleting}
                            aria-label={`Delete closure for ${closure.startDate}`}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
