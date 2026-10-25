"use client";

import { useState } from "react";
import {
  DAYS_OF_WEEK,
  type ScheduleIntervalItem,
  type ClosureItem,
} from "./operating-hours/types";
import { WeeklyScheduleSection } from "./operating-hours/WeeklyScheduleSection";
import { ExceptionalClosuresSection } from "./operating-hours/ExceptionalClosuresSection";
import {
  ScheduleIntervalDialog,
  type ScheduleIntervalFormData,
} from "./operating-hours/ScheduleIntervalDialog";
import {
  ClosureDialog,
  type ClosureFormData,
} from "./operating-hours/ClosureDialog";
import { useOrganizationSchedule } from "@/hooks/useOrganizationSchedule";
import { useOrganizationClosures } from "@/hooks/useOrganizationClosures";

// Re-export types so external callers and tests maintain full backward compatibility
export { DAYS_OF_WEEK };
export type { ScheduleIntervalItem, ClosureItem };

export interface OperatingHoursManagementProps {
  organizationId: string;
}

function OperatingHoursSkeleton() {
  return (
    <div
      aria-label="Loading operating hours"
      className="space-y-6 animate-pulse"
    >
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-6 w-48 rounded bg-gray-200" />
            <div className="h-4 w-72 rounded bg-gray-100" />
          </div>
          <div className="h-9 w-28 rounded-lg bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7 pt-2">
          {Array.from({ length: 7 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2"
            >
              <div className="h-4 w-16 rounded bg-gray-200" />
              <div className="h-3 w-12 rounded bg-gray-100" />
              <div className="h-6 w-full rounded bg-gray-200 mt-4" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-5 w-40 rounded bg-gray-200" />
          <div className="h-8 w-28 rounded-lg bg-gray-200" />
        </div>
        <div className="h-20 w-full rounded-lg bg-gray-50" />
      </div>
    </div>
  );
}

export function OperatingHoursManagement({
  organizationId,
}: OperatingHoursManagementProps) {
  // Feedback notifications
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modal dialog states
  const [isIntervalModalOpen, setIsIntervalModalOpen] = useState(false);
  const [editingInterval, setEditingInterval] =
    useState<ScheduleIntervalItem | null>(null);
  const [intervalDefaultDay, setIntervalDefaultDay] = useState<number>(1);
  const [isSavingInterval, setIsSavingInterval] = useState(false);

  const [isClosureModalOpen, setIsClosureModalOpen] = useState(false);
  const [editingClosure, setEditingClosure] = useState<ClosureItem | null>(null);
  const [isSavingClosure, setIsSavingClosure] = useState(false);

  // Clear modal states and feedback when switching organizations
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setActionSuccess(null);
    setActionError(null);
    setIsIntervalModalOpen(false);
    setEditingInterval(null);
    setIsClosureModalOpen(false);
    setEditingClosure(null);
  }

  // Hook 1: Schedule domain
  const schedule = useOrganizationSchedule({
    organizationId,
    onSuccess: (msg) => {
      setActionSuccess(msg);
      setActionError(null);
    },
    onError: (msg) => {
      setActionError(msg);
      setActionSuccess(null);
    },
  });

  // Hook 2: Closure domain
  const closures = useOrganizationClosures({
    organizationId,
    onSuccess: (msg) => {
      setActionSuccess(msg);
      setActionError(null);
    },
    onError: (msg) => {
      setActionError(msg);
      setActionSuccess(null);
    },
  });

  // Open modal handlers
  const handleOpenAddInterval = (dayOfWeek: number) => {
    setEditingInterval(null);
    setIntervalDefaultDay(dayOfWeek);
    setIsIntervalModalOpen(true);
  };

  const handleOpenEditInterval = (interval: ScheduleIntervalItem) => {
    setEditingInterval(interval);
    setIntervalDefaultDay(interval.dayOfWeek);
    setIsIntervalModalOpen(true);
  };

  const handleOpenAddClosure = () => {
    setEditingClosure(null);
    setIsClosureModalOpen(true);
  };

  const handleOpenEditClosure = (closure: ClosureItem) => {
    setEditingClosure(closure);
    setIsClosureModalOpen(true);
  };

  // Interval save handler for dialog
  const handleSaveInterval = async (data: ScheduleIntervalFormData) => {
    setIsSavingInterval(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      await schedule.saveInterval(data, editingInterval);
      setIsIntervalModalOpen(false);
    } finally {
      setIsSavingInterval(false);
    }
  };

  // Closure save handler for dialog
  const handleSaveClosure = async (data: ClosureFormData) => {
    setIsSavingClosure(true);
    setActionSuccess(null);
    setActionError(null);
    try {
      await closures.saveClosure(data, editingClosure);
      setIsClosureModalOpen(false);
    } finally {
      setIsSavingClosure(false);
    }
  };

  // Day toggle
  const handleToggleDay = async (dayOfWeek: number) => {
    setActionSuccess(null);
    setActionError(null);
    await schedule.toggleDay(dayOfWeek, () => {
      handleOpenAddInterval(dayOfWeek);
    });
  };

  // Interval action wrappers
  const handleToggleIntervalActive = async (interval: ScheduleIntervalItem) => {
    setActionSuccess(null);
    setActionError(null);
    await schedule.toggleIntervalActive(interval);
  };

  const handleDeleteInterval = async (interval: ScheduleIntervalItem) => {
    setActionSuccess(null);
    setActionError(null);
    await schedule.deleteInterval(interval);
  };

  // Closure action wrapper
  const handleDeleteClosure = async (closure: ClosureItem) => {
    setActionSuccess(null);
    setActionError(null);
    await closures.deleteClosure(closure);
  };

  if (schedule.isLoading && closures.isLoading) {
    return <OperatingHoursSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Action Notification Banners */}
      {actionSuccess && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs sm:text-sm font-medium text-emerald-800 flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-emerald-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-semibold text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-xs sm:text-sm font-medium text-red-800 flex items-center justify-between shadow-sm animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-red-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-semibold text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: Weekly Operating Hours */}
      <WeeklyScheduleSection
        intervals={schedule.intervals}
        error={schedule.error}
        mutatingIntervalId={schedule.mutatingIntervalId}
        mutatingDayOfWeek={schedule.mutatingDayOfWeek}
        onRetry={() => schedule.fetchSchedule()}
        onOpenAddInterval={handleOpenAddInterval}
        onOpenEditInterval={handleOpenEditInterval}
        onToggleIntervalActive={handleToggleIntervalActive}
        onDeleteInterval={handleDeleteInterval}
        onToggleDay={handleToggleDay}
      />

      {/* SECTION 2: Exceptional Closures */}
      <ExceptionalClosuresSection
        closures={closures.closures}
        error={closures.error}
        deletingClosureId={closures.deletingClosureId}
        onRetry={() => closures.fetchClosures()}
        onOpenAddClosure={handleOpenAddClosure}
        onOpenEditClosure={handleOpenEditClosure}
        onDeleteClosure={handleDeleteClosure}
      />

      {/* MODAL 1: Schedule Interval Modal (Create / Edit) */}
      <ScheduleIntervalDialog
        isOpen={isIntervalModalOpen}
        editingInterval={editingInterval}
        defaultDayOfWeek={intervalDefaultDay}
        existingIntervals={schedule.intervals}
        isSaving={isSavingInterval}
        onSave={handleSaveInterval}
        onClose={() => setIsIntervalModalOpen(false)}
      />

      {/* MODAL 2: Closure Modal (Create / Edit) */}
      <ClosureDialog
        isOpen={isClosureModalOpen}
        editingClosure={editingClosure}
        isSaving={isSavingClosure}
        onSave={handleSaveClosure}
        onClose={() => setIsClosureModalOpen(false)}
      />
    </div>
  );
}
