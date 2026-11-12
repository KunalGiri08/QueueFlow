"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getZonedTimeDetails } from "@/lib/formatters/date";
import {
  isValidCalendarDateString,
  isValidIanaTimezone,
} from "@/lib/validations/schedule";
import type { AvailableSlot } from "@/lib/services/appointment.service";

export type { AvailableSlot };

export interface UseAvailableSlotsOptions {
  /** Organization ID hosting the service */
  organizationId: string | null | undefined;
  /** Service ID for which appointment slots are requested */
  serviceId: string | null | undefined;
  /** Organization's IANA timezone (e.g. "Asia/Kolkata", "America/New_York") */
  timezone?: string;
  /** Optional initial selected calendar date (YYYY-MM-DD) */
  initialDate?: string;
  /** Optional custom fetch implementation (primarily for unit testing) */
  fetchFn?: typeof fetch;
}

export interface UseAvailableSlotsReturn {
  /** Currently selected calendar date in YYYY-MM-DD format */
  selectedDate: string;
  /** List of available appointment slots for the selected date */
  slots: AvailableSlot[];
  /** Whether slots for the selected date are actively being fetched */
  isLoading: boolean;
  /** Error message if slot fetching failed, or null */
  error: string | null;
  /** Sets the active calendar date and triggers slot fetching */
  setSelectedDate: (dateString: string) => void;
  /** Re-fetches slots for the currently selected date without clearing previous slots */
  refreshSlots: () => Promise<void>;
}

/**
 * Validates whether an unknown object matches the AvailableSlot contract.
 */
export function isValidAvailableSlot(item: unknown): item is AvailableSlot {
  if (!item || typeof item !== "object") return false;
  const s = item as Record<string, unknown>;
  return (
    typeof s.slotStart === "string" &&
    typeof s.slotEnd === "string" &&
    typeof s.localStartTime === "string" &&
    typeof s.localEndTime === "string" &&
    typeof s.bookedCount === "number" &&
    typeof s.maxCapacity === "number" &&
    typeof s.remainingCapacity === "number" &&
    typeof s.isAvailable === "boolean"
  );
}

/**
 * Derives today's calendar date ("YYYY-MM-DD") in the specified organization timezone.
 * Falls back to UTC if the timezone is missing or invalid.
 */
export function getTodayInTimezone(timeZone?: string): string {
  const tz = timeZone && isValidIanaTimezone(timeZone) ? timeZone : "UTC";
  const details = getZonedTimeDetails(new Date(), tz);
  if (details?.dateStr) {
    return details.dateStr;
  }
  return new Date().toISOString().slice(0, 10);
}

function resolveInitialDate(initialDate?: string, timeZone?: string): string {
  if (initialDate && isValidCalendarDateString(initialDate)) {
    return initialDate;
  }
  return getTodayInTimezone(timeZone);
}

/**
 * React hook that manages slot availability fetching, date selection,
 * AbortController cancellations, and stale response protection for appointments.
 */
export function useAvailableSlots({
  organizationId,
  serviceId,
  timezone,
  initialDate,
  fetchFn = globalThis.fetch,
}: UseAvailableSlotsOptions): UseAvailableSlotsReturn {
  const [selectedDate, setSelectedDateState] = useState<string>(() =>
    resolveInitialDate(initialDate, timezone),
  );
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() =>
    Boolean(organizationId && serviceId),
  );
  const [error, setError] = useState<string | null>(null);

  // Lifecycle and concurrency tracking refs
  const isMountedRef = useRef<boolean>(true);
  const activeControllerRef = useRef<AbortController | null>(null);
  const fetchGenRef = useRef<number>(0);

  // Sync state if initialDate prop changes from outside
  const [prevInitialDate, setPrevInitialDate] = useState(initialDate);
  if (initialDate && initialDate !== prevInitialDate) {
    setPrevInitialDate(initialDate);
    setSelectedDateState(initialDate);
  }

  // If timezone changes and no initialDate was specified, update to today in new timezone
  const [prevTimezone, setPrevTimezone] = useState(timezone);
  if (timezone !== prevTimezone && !initialDate) {
    setPrevTimezone(timezone);
    setSelectedDateState(getTodayInTimezone(timezone));
  }

  // Reset state during render when switching organization, service, or date
  const [prevServiceId, setPrevServiceId] = useState(serviceId);
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  const [prevDate, setPrevDate] = useState(selectedDate);
  if (
    serviceId !== prevServiceId ||
    organizationId !== prevOrgId ||
    selectedDate !== prevDate
  ) {
    setPrevServiceId(serviceId);
    setPrevOrgId(organizationId);
    setPrevDate(selectedDate);
    setSlots([]);
    setError(null);
    setIsLoading(Boolean(organizationId && serviceId && selectedDate));
  }

  const loadSlots = useCallback(
    async (targetDate: string, signal?: AbortSignal) => {
      if (signal?.aborted) return;
      const gen = ++fetchGenRef.current;

      try {
        const url = `/api/public/organizations/${encodeURIComponent(organizationId!)}/services/${encodeURIComponent(serviceId!)}/slots?date=${encodeURIComponent(targetDate)}`;
        const res = await fetchFn(url, { signal });

        if (
          signal?.aborted ||
          fetchGenRef.current !== gen ||
          !isMountedRef.current
        ) {
          return;
        }

        if (!res.ok) {
          let errorMsg = `Failed to fetch slots (${res.status})`;
          try {
            const errData: unknown = await res.json();
            if (
              errData &&
              typeof errData === "object" &&
              "error" in errData &&
              typeof (errData as { error: unknown }).error === "string"
            ) {
              errorMsg = (errData as { error: string }).error;
            }
          } catch {
            // response was not JSON, fallback to default message
          }
          setError(errorMsg);
          setSlots([]);
          return;
        }

        const data: unknown = await res.json();

        if (
          signal?.aborted ||
          fetchGenRef.current !== gen ||
          !isMountedRef.current
        ) {
          return;
        }

        if (
          !data ||
          typeof data !== "object" ||
          !("slots" in data) ||
          !Array.isArray((data as { slots: unknown }).slots)
        ) {
          setError("Malformed slots response");
          setSlots([]);
          return;
        }

        const rawSlots = (data as { slots: unknown[] }).slots;
        const validSlots = rawSlots.filter(isValidAvailableSlot);
        setSlots(validSlots);
        setError(null);
      } catch (err: unknown) {
        if (
          signal?.aborted ||
          fetchGenRef.current !== gen ||
          !isMountedRef.current
        ) {
          return;
        }

        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }

        setError(
          err instanceof Error ? err.message : "An unexpected error occurred",
        );
        setSlots([]);
      } finally {
        if (
          !signal?.aborted &&
          fetchGenRef.current === gen &&
          isMountedRef.current
        ) {
          setIsLoading(false);
        }
      }
    },
    [organizationId, serviceId, fetchFn],
  );

  // Trigger fetch when organization, service, or selectedDate changes
  useEffect(() => {
    isMountedRef.current = true;

    if (!organizationId || !serviceId || !selectedDate) {
      return;
    }

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;

    void Promise.resolve().then(() => {
      if (isMountedRef.current) {
        return loadSlots(selectedDate, controller.signal);
      }
    });

    return () => {
      controller.abort();
    };
  }, [organizationId, serviceId, selectedDate, loadSlots]);

  // Track unmount cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (activeControllerRef.current) {
        activeControllerRef.current.abort();
      }
    };
  }, []);

  const setSelectedDate = useCallback((newDate: string) => {
    setSelectedDateState(newDate);
  }, []);

  const refreshSlots = useCallback(async () => {
    if (!organizationId || !serviceId || !selectedDate) return;
    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    await loadSlots(selectedDate, controller.signal);
  }, [organizationId, serviceId, loadSlots, selectedDate]);

  return {
    selectedDate,
    slots,
    isLoading,
    error,
    setSelectedDate,
    refreshSlots,
  };
}
