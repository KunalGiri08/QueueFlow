"use client";

import { useMemo } from "react";
import { timeToMinutes } from "@/lib/validations/schedule";
import {
  DAYS_OF_WEEK,
  type ScheduleIntervalItem,
} from "./types";

export interface WeeklyScheduleSectionProps {
  intervals: ScheduleIntervalItem[];
  error: string | null;
  mutatingIntervalId: string | null;
  mutatingDayOfWeek: number | null;
  onRetry: () => void;
  onOpenAddInterval: (dayOfWeek: number) => void;
  onOpenEditInterval: (interval: ScheduleIntervalItem) => void;
  onToggleIntervalActive: (interval: ScheduleIntervalItem) => void;
  onDeleteInterval: (interval: ScheduleIntervalItem) => void;
  onToggleDay: (dayOfWeek: number) => void;
}

export function WeeklyScheduleSection({
  intervals,
  error,
  mutatingIntervalId,
  mutatingDayOfWeek,
  onRetry,
  onOpenAddInterval,
  onOpenEditInterval,
  onToggleIntervalActive,
  onDeleteInterval,
  onToggleDay,
}: WeeklyScheduleSectionProps) {
  // Group intervals by dayOfWeek
  const intervalsByDay = useMemo(() => {
    return DAYS_OF_WEEK.reduce<Record<number, ScheduleIntervalItem[]>>(
      (acc, { day }) => {
        acc[day] = intervals
          .filter((i) => i.dayOfWeek === day)
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        return acc;
      },
      {},
    );
  }, [intervals]);

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
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <h3 className="text-lg font-bold text-gray-900">
              Weekly Operating Hours
            </h3>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-gray-500">
            Configure regular weekly opening hours. Ticket admission is automatically
            restricted outside these working intervals.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenAddInterval(1)}
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
          Add Hours
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
            Retry Schedule
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-7">
          {DAYS_OF_WEEK.map(({ day, name, short }) => {
            const dayIntervals = intervalsByDay[day] || [];
            const hasActiveIntervals = dayIntervals.some((i) => i.isActive);
            const isMutatingDay = mutatingDayOfWeek === day;

            return (
              <div
                key={day}
                className={`flex flex-col rounded-xl border p-4 transition-colors ${
                  hasActiveIntervals
                    ? "border-gray-200 bg-white"
                    : "border-gray-100 bg-gray-50/70"
                }`}
              >
                {/* Day Header & Toggle */}
                <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                  <div>
                    <span className="block text-sm font-bold text-gray-900">
                      {short}
                    </span>
                    <span className="text-[11px] text-gray-500 font-medium">
                      {name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleDay(day)}
                    disabled={isMutatingDay}
                    aria-label={`Toggle ${name} opening status`}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 ${
                      hasActiveIntervals ? "bg-gray-900" : "bg-gray-200"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        hasActiveIntervals ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* Intervals List */}
                <div className="mt-3 flex-1 space-y-2">
                  {dayIntervals.length === 0 ? (
                    <div className="py-4 text-center">
                      <span className="text-xs font-medium text-gray-400">
                        Closed
                      </span>
                    </div>
                  ) : (
                    dayIntervals.map((interval) => {
                      const isMutating = mutatingIntervalId === interval.id;
                      return (
                        <div
                          key={interval.id}
                          className={`group relative rounded-lg border p-2 text-xs transition-all ${
                            interval.isActive
                              ? "border-gray-200 bg-gray-50/50 hover:border-gray-300 hover:bg-white"
                              : "border-gray-200/60 bg-gray-100/50 text-gray-400 opacity-75"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`font-mono font-medium ${
                                interval.isActive
                                  ? "text-gray-900"
                                  : "text-gray-400 line-through"
                              }`}
                            >
                              {interval.startTime} - {interval.endTime}
                            </span>
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                interval.isActive ? "bg-emerald-500" : "bg-gray-300"
                              }`}
                              aria-hidden="true"
                            />
                          </div>

                          {/* Interval Actions */}
                          <div className="mt-2 flex items-center justify-end gap-1.5 pt-1.5 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => onToggleIntervalActive(interval)}
                              disabled={isMutating}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200/70 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 disabled:opacity-50"
                            >
                              {interval.isActive ? "Pause" : "Resume"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenEditInterval(interval)}
                              disabled={isMutating}
                              aria-label={`Edit ${name} interval ${interval.startTime} to ${interval.endTime}`}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:bg-gray-200/70 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteInterval(interval)}
                              disabled={isMutating}
                              aria-label={`Delete ${name} interval ${interval.startTime} to ${interval.endTime}`}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-500 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add Hour Button per Day */}
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => onOpenAddInterval(day)}
                    className="w-full rounded-md border border-dashed border-gray-300 py-1.5 text-center text-xs font-medium text-gray-600 hover:border-gray-900 hover:bg-gray-50 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-900"
                  >
                    + Add Shift
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
