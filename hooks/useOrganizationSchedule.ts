"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { doIntervalsOverlap } from "@/lib/validations/schedule";
import {
  DAYS_OF_WEEK,
  type ScheduleIntervalItem,
} from "@/components/admin/operating-hours/types";
import type { ScheduleIntervalFormData } from "@/components/admin/operating-hours/ScheduleIntervalDialog";

export interface UseOrganizationScheduleOptions {
  organizationId: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  confirmDialog?: (message: string) => boolean;
}

export interface UseOrganizationScheduleReturn {
  intervals: ScheduleIntervalItem[];
  isLoading: boolean;
  error: string | null;
  mutatingIntervalId: string | null;
  mutatingDayOfWeek: number | null;
  fetchSchedule: (signal?: AbortSignal) => Promise<void>;
  saveInterval: (
    data: ScheduleIntervalFormData,
    editingInterval?: ScheduleIntervalItem | null,
  ) => Promise<ScheduleIntervalItem>;
  toggleIntervalActive: (interval: ScheduleIntervalItem) => Promise<boolean>;
  deleteInterval: (interval: ScheduleIntervalItem) => Promise<boolean>;
  toggleDay: (dayOfWeek: number, onDayEmpty?: () => void) => Promise<boolean>;
}

export function useOrganizationSchedule({
  organizationId,
  onSuccess,
  onError,
  confirmDialog,
}: UseOrganizationScheduleOptions): UseOrganizationScheduleReturn {
  const router = useRouter();
  const routerRef = useRef(router);

  // Update routerRef after every render so callbacks always hold the latest router
  // instance without being listed as a useCallback dependency.
  useEffect(() => {
    routerRef.current = router;
  });

  const [intervals, setIntervals] = useState<ScheduleIntervalItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingIntervalId, setMutatingIntervalId] = useState<string | null>(null);
  const [mutatingDayOfWeek, setMutatingDayOfWeek] = useState<number | null>(null);

  const fetchGenRef = useRef<number>(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  // Reset state when switching organization
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setIntervals([]);
    setError(null);
    setMutatingIntervalId(null);
    setMutatingDayOfWeek(null);
  }

  const confirmFn =
    confirmDialog ??
    (typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm.bind(window)
      : () => true);

  // Fetch schedule
  const fetchSchedule = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted) return;
      const gen = ++fetchGenRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/schedule`,
          { signal },
        );

        if (signal?.aborted || fetchGenRef.current !== gen) return;

        if (res.status === 401) {
          routerRef.current.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (res.status === 403) {
          setError("Administrator permissions required to view schedule.");
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load schedule intervals (${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Invalid schedule payload");
        }

        const validated: ScheduleIntervalItem[] = data.filter(
          (item): item is ScheduleIntervalItem =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string" &&
            typeof item.organizationId === "string" &&
            typeof item.dayOfWeek === "number" &&
            typeof item.startTime === "string" &&
            typeof item.endTime === "string" &&
            typeof item.isActive === "boolean",
        );

        if (signal?.aborted || fetchGenRef.current !== gen) return;
        setIntervals(validated);
      } catch (err: unknown) {
        if (signal?.aborted || fetchGenRef.current !== gen) return;
        if (
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: string }).name === "AbortError")
        ) {
          return;
        }
        setError("Failed to load working schedule. Please try again.");
      } finally {
        if (!signal?.aborted && fetchGenRef.current === gen) {
          setIsLoading(false);
        }
      }
    },
    [organizationId],
  );

  useEffect(() => {
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    void fetchSchedule(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchSchedule]);

  // Save interval (POST new or PATCH existing)
  const saveInterval = useCallback(
    async (
      data: ScheduleIntervalFormData,
      editingInterval?: ScheduleIntervalItem | null,
    ): Promise<ScheduleIntervalItem> => {
      if (editingInterval) {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(
            organizationId,
          )}/schedule/${encodeURIComponent(editingInterval.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
        );

        if (!res.ok) {
          const errData = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errData?.error || "Failed to update schedule interval");
        }

        const updated: ScheduleIntervalItem = await res.json();
        setIntervals((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i)),
        );
        onSuccess?.("Schedule interval updated successfully.");
        return updated;
      } else {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/schedule`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          },
        );

        if (!res.ok) {
          const errData = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errData?.error || "Failed to create schedule interval");
        }

        const created: ScheduleIntervalItem = await res.json();
        setIntervals((prev) => [...prev, created]);
        onSuccess?.("Schedule interval added successfully.");
        return created;
      }
    },
    [organizationId, onSuccess],
  );

  // Toggle single interval active status
  const toggleIntervalActive = useCallback(
    async (interval: ScheduleIntervalItem): Promise<boolean> => {
      setMutatingIntervalId(interval.id);

      const nextActive = !interval.isActive;

      // Check overlap if turning on
      if (nextActive) {
        const otherActive = intervals.filter(
          (i) => i.dayOfWeek === interval.dayOfWeek && i.isActive && i.id !== interval.id,
        );
        for (const other of otherActive) {
          if (
            doIntervalsOverlap(
              { startTime: interval.startTime, endTime: interval.endTime },
              other,
            )
          ) {
            onError?.(
              `Cannot activate interval: overlaps with active hours (${other.startTime} - ${other.endTime}).`,
            );
            setMutatingIntervalId(null);
            return false;
          }
        }
      }

      try {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(
            organizationId,
          )}/schedule/${encodeURIComponent(interval.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: nextActive }),
          },
        );

        if (!res.ok) {
          const errData = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errData?.error || "Failed to update interval status");
        }

        const updated: ScheduleIntervalItem = await res.json();
        setIntervals((prev) =>
          prev.map((i) => (i.id === updated.id ? updated : i)),
        );
        onSuccess?.(
          `Interval ${updated.startTime} - ${updated.endTime} ${
            nextActive ? "activated" : "deactivated"
          }.`,
        );
        return true;
      } catch (err: unknown) {
        onError?.(
          err instanceof Error ? err.message : "Failed to toggle interval status",
        );
        return false;
      } finally {
        setMutatingIntervalId(null);
      }
    },
    [intervals, organizationId, onSuccess, onError],
  );

  // Delete interval
  const deleteInterval = useCallback(
    async (interval: ScheduleIntervalItem): Promise<boolean> => {
      const confirmed = confirmFn(
        `Are you sure you want to remove the hours ${interval.startTime} - ${interval.endTime}?`,
      );
      if (!confirmed) {
        return false;
      }

      setMutatingIntervalId(interval.id);

      try {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(
            organizationId,
          )}/schedule/${encodeURIComponent(interval.id)}`,
          {
            method: "DELETE",
          },
        );

        if (!res.ok && res.status !== 204) {
          const errData = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errData?.error || "Failed to delete schedule interval");
        }

        setIntervals((prev) => prev.filter((i) => i.id !== interval.id));
        onSuccess?.("Schedule interval deleted successfully.");
        return true;
      } catch (err: unknown) {
        onError?.(
          err instanceof Error ? err.message : "Failed to delete schedule interval",
        );
        return false;
      } finally {
        setMutatingIntervalId(null);
      }
    },
    [confirmFn, organizationId, onSuccess, onError],
  );

  // Toggle whole day enabled / disabled
  const toggleDay = useCallback(
    async (dayOfWeek: number, onDayEmpty?: () => void): Promise<boolean> => {
      const dayIntervals = intervals.filter((i) => i.dayOfWeek === dayOfWeek);
      const hasActive = dayIntervals.some((i) => i.isActive);

      setMutatingDayOfWeek(dayOfWeek);

      try {
        if (dayIntervals.length === 0) {
          onDayEmpty?.();
          setMutatingDayOfWeek(null);
          return false;
        }

        if (hasActive) {
          // Disable day: turn all intervals inactive
          const toDeactivate = dayIntervals.filter((i) => i.isActive);
          await Promise.all(
            toDeactivate.map(async (interval) => {
              const res = await fetch(
                `/api/organizations/${encodeURIComponent(
                  organizationId,
                )}/schedule/${encodeURIComponent(interval.id)}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ isActive: false }),
                },
              );
              if (!res.ok) {
                throw new Error("Failed to deactivate some intervals");
              }
              return (await res.json()) as ScheduleIntervalItem;
            }),
          );

          setIntervals((prev) =>
            prev.map((i) => (i.dayOfWeek === dayOfWeek ? { ...i, isActive: false } : i)),
          );
          const dayName = DAYS_OF_WEEK.find((d) => d.day === dayOfWeek)?.name;
          onSuccess?.(`${dayName} marked as closed.`);
          return true;
        } else {
          // Enable day: activate intervals without overlapping
          const firstInterval = dayIntervals[0];
          const res = await fetch(
            `/api/organizations/${encodeURIComponent(
              organizationId,
            )}/schedule/${encodeURIComponent(firstInterval.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isActive: true }),
            },
          );

          if (!res.ok) {
            const errData = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(errData?.error || "Failed to activate interval");
          }

          const updated: ScheduleIntervalItem = await res.json();
          setIntervals((prev) =>
            prev.map((i) => (i.id === updated.id ? updated : i)),
          );
          const dayName = DAYS_OF_WEEK.find((d) => d.day === dayOfWeek)?.name;
          onSuccess?.(`${dayName} marked as open.`);
          return true;
        }
      } catch (err: unknown) {
        onError?.(
          err instanceof Error ? err.message : "Failed to toggle day schedule",
        );
        return false;
      } finally {
        setMutatingDayOfWeek(null);
      }
    },
    [intervals, organizationId, onSuccess, onError],
  );

  return {
    intervals,
    isLoading,
    error,
    mutatingIntervalId,
    mutatingDayOfWeek,
    fetchSchedule,
    saveInterval,
    toggleIntervalActive,
    deleteInterval,
    toggleDay,
  };
}
