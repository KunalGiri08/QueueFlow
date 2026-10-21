"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";
import { AppointmentCard } from "@/components/appointments/AppointmentCard";
import { AppointmentsEmptyState } from "@/components/appointments/AppointmentsEmptyState";
import { AppointmentsLoadingSkeleton } from "@/components/appointments/AppointmentsLoadingSkeleton";
import { CancelAppointmentDialog } from "@/components/appointments/CancelAppointmentDialog";
import { RescheduleAppointmentDialog } from "@/components/appointments/RescheduleAppointmentDialog";
import type {
  CustomerAppointment,
  AppointmentStatus,
} from "@/components/appointments/types";

export type { CustomerAppointment, AppointmentStatus };

function isValidAppointment(item: unknown): item is CustomerAppointment {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as CustomerAppointment).id === "string" &&
    typeof (item as CustomerAppointment).serviceId === "string" &&
    typeof (item as CustomerAppointment).scheduledAt === "string" &&
    typeof (item as CustomerAppointment).status === "string" &&
    typeof (item as CustomerAppointment).createdAt === "string" &&
    typeof (item as CustomerAppointment).service === "object" &&
    (item as CustomerAppointment).service !== null &&
    typeof (item as CustomerAppointment).service.id === "string" &&
    typeof (item as CustomerAppointment).service.name === "string" &&
    typeof (item as CustomerAppointment).service.organization === "object" &&
    (item as CustomerAppointment).service.organization !== null &&
    typeof (item as CustomerAppointment).service.organization.id === "string" &&
    typeof (item as CustomerAppointment).service.organization.name === "string"
  );
}

export default function MyAppointmentsPage() {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [appointments, setAppointments] = useState<CustomerAppointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal dialog states
  const [cancellingAppointment, setCancellingAppointment] =
    useState<CustomerAppointment | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelDialogError, setCancelDialogError] = useState<string | null>(
    null,
  );

  const [reschedulingAppointment, setReschedulingAppointment] =
    useState<CustomerAppointment | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDialogError, setRescheduleDialogError] = useState<
    string | null
  >(null);

  const [actionError, setActionError] = useState<{
    appointmentId: string;
    message: string;
  } | null>(null);

  // Concurrency & lifecycle refs
  const activeFetchControllerRef = useRef<AbortController | null>(null);
  const fetchGenerationRef = useRef<number>(0);
  const isCancellingRef = useRef(false);
  const isReschedulingRef = useRef(false);

  const fetchAppointments = useCallback(
    async (showSkeleton = true) => {
      if (activeFetchControllerRef.current) {
        activeFetchControllerRef.current.abort();
      }

      const controller = new AbortController();
      activeFetchControllerRef.current = controller;
      const currentGen = ++fetchGenerationRef.current;

      if (showSkeleton) {
        setIsLoading(true);
      }
      setFetchError(null);

      try {
        const response = await fetch("/api/appointments", {
          signal: controller.signal,
        });

        if (currentGen !== fetchGenerationRef.current) return;

        if (response.status === 401) {
          router.push(
            `/sign-in?redirect_url=${encodeURIComponent("/appointments")}`,
          );
          return;
        }

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const json: unknown = await response.json();

        if (currentGen !== fetchGenerationRef.current) return;

        if (!Array.isArray(json)) {
          throw new Error("Malformed response format");
        }

        const validAppointments = json.filter(isValidAppointment);

        if (currentGen !== fetchGenerationRef.current) return;
        setAppointments(validAppointments);
      } catch (err: unknown) {
        if (currentGen !== fetchGenerationRef.current) return;
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }
        setFetchError(
          "Unable to load your appointments at this time. Please try again.",
        );
      } finally {
        if (currentGen === fetchGenerationRef.current) {
          setIsLoading(false);
          activeFetchControllerRef.current = null;
        }
      }
    },
    [router],
  );

  const handleOpenCancelDialog = (appointment: CustomerAppointment) => {
    setActionError(null);
    setCancelDialogError(null);
    setCancellingAppointment(appointment);
  };

  const handleCloseCancelDialog = () => {
    if (isCancelling) return;
    setCancellingAppointment(null);
    setCancelDialogError(null);
  };

  const handleConfirmCancel = async () => {
    if (!cancellingAppointment || isCancellingRef.current) return;

    isCancellingRef.current = true;
    setIsCancelling(true);
    setCancelDialogError(null);

    const targetId = cancellingAppointment.id;

    try {
      const response = await fetch(
        `/api/appointments/${encodeURIComponent(targetId)}/cancel`,
        {
          method: "PATCH",
        },
      );

      if (response.status === 401) {
        router.push(
          `/sign-in?redirect_url=${encodeURIComponent("/appointments")}`,
        );
        return;
      }

      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setCancelDialogError(
          data?.error ||
            "This appointment can no longer be cancelled because its status has changed.",
        );
        await fetchAppointments(false);
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setCancelDialogError(
          data?.error ||
            "Unable to cancel appointment at this time. Please try again.",
        );
        return;
      }

      const updated = await response.json().catch(() => null);

      // Confirmed success: update appointment in state
      setAppointments((prev) =>
        prev.map((item) =>
          item.id === targetId
            ? {
                ...item,
                status: updated?.status || "CANCELLED",
                updatedAt: updated?.updatedAt || new Date().toISOString(),
              }
            : item,
        ),
      );

      setCancellingAppointment(null);
      setCancelDialogError(null);
    } catch {
      setCancelDialogError(
        "Unable to connect to the server. Please check your connection and try again.",
      );
    } finally {
      isCancellingRef.current = false;
      setIsCancelling(false);
    }
  };

  const handleOpenRescheduleDialog = (appointment: CustomerAppointment) => {
    setActionError(null);
    setRescheduleDialogError(null);
    setReschedulingAppointment(appointment);
  };

  const handleCloseRescheduleDialog = () => {
    if (isRescheduling) return;
    setReschedulingAppointment(null);
    setRescheduleDialogError(null);
  };

  const handleConfirmReschedule = async (newScheduledAt: string) => {
    if (!reschedulingAppointment || isReschedulingRef.current) return;

    isReschedulingRef.current = true;
    setIsRescheduling(true);
    setRescheduleDialogError(null);

    const targetId = reschedulingAppointment.id;

    try {
      const response = await fetch(
        `/api/appointments/${encodeURIComponent(targetId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scheduledAt: newScheduledAt,
          }),
        },
      );

      if (response.status === 401) {
        router.push(
          `/sign-in?redirect_url=${encodeURIComponent("/appointments")}`,
        );
        return;
      }

      if (response.status === 409) {
        const data = await response.json().catch(() => null);
        setRescheduleDialogError(
          data?.error || "This appointment time slot is already booked.",
        );
        if (
          data?.error ===
          "Appointment cannot be rescheduled in its current state"
        ) {
          await fetchAppointments(false);
        }
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setRescheduleDialogError(
          data?.error ||
            "Unable to reschedule appointment at this time. Please try again.",
        );
        return;
      }

      const updated = await response.json().catch(() => null);

      // Confirmed success: update appointment in state
      setAppointments((prev) =>
        prev.map((item) =>
          item.id === targetId
            ? {
                ...item,
                scheduledAt: updated?.scheduledAt || newScheduledAt,
                updatedAt: updated?.updatedAt || new Date().toISOString(),
              }
            : item,
        ),
      );

      setReschedulingAppointment(null);
      setRescheduleDialogError(null);
    } catch {
      setRescheduleDialogError(
        "Unable to connect to the server. Please check your connection and try again.",
      );
    } finally {
      isReschedulingRef.current = false;
      setIsRescheduling(false);
    }
  };

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent("/appointments")}`,
      );
      return;
    }

    void Promise.resolve().then(() => fetchAppointments());

    return () => {
      if (activeFetchControllerRef.current) {
        activeFetchControllerRef.current.abort();
      }
    };
  }, [isLoaded, isSignedIn, router, fetchAppointments]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              My Appointments
            </h1>
            <p className="mt-2 text-base text-gray-600 sm:text-lg">
              View your scheduled appointments and past booking history.
            </p>
          </div>

          {!isLoaded || (!isSignedIn && isLoaded) || isLoading ? (
            <AppointmentsLoadingSkeleton />
          ) : fetchError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{fetchError}</p>
              <button
                type="button"
                onClick={() => fetchAppointments(true)}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : appointments.length === 0 ? (
            <AppointmentsEmptyState />
          ) : (
            <div className="space-y-4">
              {appointments.map((appointment) => (
                <AppointmentCard
                  key={appointment.id}
                  appointment={appointment}
                  onCancelClick={handleOpenCancelDialog}
                  onRescheduleClick={handleOpenRescheduleDialog}
                  actionError={
                    actionError?.appointmentId === appointment.id
                      ? actionError.message
                      : null
                  }
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <CancelAppointmentDialog
        isOpen={Boolean(cancellingAppointment)}
        appointment={cancellingAppointment}
        isCancelling={isCancelling}
        error={cancelDialogError}
        onConfirm={handleConfirmCancel}
        onClose={handleCloseCancelDialog}
      />

      <RescheduleAppointmentDialog
        isOpen={Boolean(reschedulingAppointment)}
        appointment={reschedulingAppointment}
        isSubmitting={isRescheduling}
        error={rescheduleDialogError}
        onConfirm={handleConfirmReschedule}
        onClose={handleCloseRescheduleDialog}
      />
    </>
  );
}
