"use client";

import { use, useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { BookAppointmentDialog } from "@/components/appointments/BookAppointmentDialog";
import type { BookedAppointmentSuccessData } from "@/components/appointments/types";
import {
  QueueCatalogItem,
  formatAdmissionErrorMessage,
  type PublicQueue,
  type PublicService,
  type OrganizationServicesData,
  type QueueAvailabilityData,
  type AdmissionErrorPayload,
  type QueueAvailabilityEntry,
} from "@/components/organizations";

export type {
  QueueAvailabilityData,
  AdmissionErrorPayload,
  PublicQueue,
  PublicService,
  OrganizationServicesData,
  QueueAvailabilityEntry,
};

interface PageProps {
  params: Promise<{ organizationId: string }>;
}

function isValidQueue(q: unknown): q is PublicQueue {
  if (!q || typeof q !== "object") return false;
  const item = q as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    item.id.trim() !== "" &&
    typeof item.name === "string" &&
    item.name.trim() !== "" &&
    (item.isActive === undefined || typeof item.isActive === "boolean")
  );
}

function isValidService(s: unknown): s is PublicService {
  if (!s || typeof s !== "object") return false;
  const item = s as Record<string, unknown>;
  const isDescriptionValid =
    item.description === null || typeof item.description === "string";
  return (
    typeof item.id === "string" &&
    item.id.trim() !== "" &&
    typeof item.name === "string" &&
    item.name.trim() !== "" &&
    isDescriptionValid &&
    Array.isArray(item.queues) &&
    item.queues.every(isValidQueue)
  );
}

function parseOrganizationServices(
  json: unknown,
): OrganizationServicesData | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  if (!obj.organization || typeof obj.organization !== "object") return null;
  const org = obj.organization as Record<string, unknown>;
  if (
    typeof org.id !== "string" ||
    org.id.trim() === "" ||
    typeof org.name !== "string" ||
    org.name.trim() === "" ||
    typeof org.slug !== "string" ||
    org.slug.trim() === ""
  ) {
    return null;
  }

  if (!Array.isArray(obj.services)) return null;
  if (!obj.services.every(isValidService)) return null;

  return {
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
    },
    services: obj.services as PublicService[],
  };
}

function ServicesLoadingSkeleton() {
  return (
    <div aria-label="Loading services" className="animate-pulse">
      <div className="mb-6 h-4 w-36 rounded bg-gray-200" />
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <div className="h-9 w-64 rounded bg-gray-200" />
          <div className="h-6 w-20 rounded bg-gray-100" />
        </div>
        <div className="mt-3 h-4 w-48 rounded bg-gray-100" />
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div
            key={idx}
            className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div>
              <div className="h-6 w-2/3 rounded bg-gray-200" />
              <div className="mt-3 h-4 w-5/6 rounded bg-gray-100" />
              <div className="mt-2 h-4 w-1/2 rounded bg-gray-100" />
            </div>
            <div className="mt-6 border-t border-gray-100 pt-4">
              <div className="mb-2 h-3 w-20 rounded bg-gray-100" />
              <div className="space-y-2">
                <div className="h-10 w-full rounded-lg bg-gray-100" />
                <div className="h-10 w-full rounded-lg bg-gray-100" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrganizationServicesContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ organizationId: string }>;
}) {
  const router = useRouter();
  const { isLoaded = true, isSignedIn } = useAuth();
  const resolvedParams = use(paramsPromise);
  const navParams = useParams<{ organizationId: string }>();
  const organizationId =
    resolvedParams?.organizationId || navParams?.organizationId;

  const [data, setData] = useState<OrganizationServicesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  const [joiningQueueId, setJoiningQueueId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<{
    queueId: string;
    message: string;
    code?: string;
  } | null>(null);

  const [bookingService, setBookingService] = useState<PublicService | null>(
    null,
  );
  const [isBooking, setIsBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccessData, setBookingSuccessData] =
    useState<BookedAppointmentSuccessData | null>(null);

  const [queueAvailability, setQueueAvailability] = useState<
    Record<string, QueueAvailabilityEntry>
  >({});

  const activeCatalogControllerRef = useRef<AbortController | null>(null);
  const catalogGenRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);
  const isJoiningRef = useRef<boolean>(false);
  const joinGenRef = useRef<number>(0);
  const isBookingRef = useRef<boolean>(false);
  const bookingGenRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (activeCatalogControllerRef.current) {
        activeCatalogControllerRef.current.abort();
      }
    };
  }, []);

  const fetchServices = useCallback(async () => {
    if (!organizationId) return;

    if (activeCatalogControllerRef.current) {
      activeCatalogControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeCatalogControllerRef.current = controller;

    const currentGen = ++catalogGenRef.current;

    setIsLoading(true);
    setError(null);
    setIsNotFound(false);

    try {
      const response = await fetch(
        `/api/public/organizations/${encodeURIComponent(organizationId)}/services`,
        { signal: controller.signal },
      );

      if (!isMountedRef.current || catalogGenRef.current !== currentGen) {
        return;
      }

      if (response.status === 404) {
        setIsNotFound(true);
        setData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const json: unknown = await response.json();

      if (!isMountedRef.current || catalogGenRef.current !== currentGen) {
        return;
      }

      const validated = parseOrganizationServices(json);
      if (!validated) {
        throw new Error("Malformed response format");
      }

      setData(validated);
    } catch (err: unknown) {
      if (
        (err instanceof Error && err.name === "AbortError") ||
        controller.signal.aborted
      ) {
        return;
      }

      if (!isMountedRef.current || catalogGenRef.current !== currentGen) {
        return;
      }

      setError("Unable to load services at this time. Please try again.");
      setData(null);
    } finally {
      if (isMountedRef.current && catalogGenRef.current === currentGen) {
        setIsLoading(false);
      }
    }
  }, [organizationId]);

  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setJoiningQueueId(null);
    setQueueError(null);
    setIsBooking(false);
    setBookingService(null);
    setBookingError(null);
    setBookingSuccessData(null);
    setQueueAvailability({});
  }

  const performFetchQueueAvailability = useCallback((queueId: string) => {
    Promise.resolve(fetch(`/api/queues/${encodeURIComponent(queueId)}`))
      .then((response) => {
        if (!response || typeof response.ok !== "boolean" || !response.ok) {
          throw new Error(`Server returned status ${response?.status}`);
        }
        return response.json() as Promise<QueueAvailabilityData>;
      })
      .then((avail) => {
        if (!isMountedRef.current) return;
        setQueueAvailability((prev) => ({
          ...prev,
          [queueId]: {
            data: avail,
            isLoading: false,
            error: null,
          },
        }));
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setQueueAvailability((prev) => ({
          ...prev,
          [queueId]: {
            data: prev[queueId]?.data ?? null,
            isLoading: false,
            error: "Unable to load availability",
          },
        }));
      });
  }, []);

  const fetchQueueAvailability = useCallback(
    (queueId: string) => {
      setQueueAvailability((prev) => ({
        ...prev,
        [queueId]: {
          data: prev[queueId]?.data ?? null,
          isLoading: prev[queueId]?.data ? false : true,
          error: null,
        },
      }));

      performFetchQueueAvailability(queueId);
    },
    [performFetchQueueAvailability],
  );

  useEffect(() => {
    if (!data) return;
    const activeQueues = data.services
      .flatMap((s) => s.queues)
      .filter((q) => q.isActive !== false);

    for (const q of activeQueues) {
      performFetchQueueAvailability(q.id);
    }
  }, [data, performFetchQueueAvailability]);

  useEffect(() => {
    // Invalidate pending join and booking when organization identity changes
    joinGenRef.current++;
    isJoiningRef.current = false;
    bookingGenRef.current++;
    isBookingRef.current = false;

    void Promise.resolve().then(() => fetchServices());

    return () => {
      if (activeCatalogControllerRef.current) {
        activeCatalogControllerRef.current.abort();
      }
    };
  }, [fetchServices]);

  const handleJoinQueue = async (queueId: string) => {
    if (!organizationId) return;

    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
      );
      return;
    }

    if (isJoiningRef.current) return;
    isJoiningRef.current = true;

    const currentJoinGen = ++joinGenRef.current;
    let hasNavigated = false;

    setQueueError((prev) => (prev?.queueId === queueId ? null : prev));
    setJoiningQueueId(queueId);

    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queueId }),
      });

      if (!isMountedRef.current || joinGenRef.current !== currentJoinGen) {
        return;
      }

      if (response.status === 201) {
        const ticketData: unknown = await response.json();

        if (
          ticketData &&
          typeof ticketData === "object" &&
          "trackingToken" in ticketData &&
          typeof (ticketData as { trackingToken: unknown }).trackingToken ===
            "string" &&
          (ticketData as { trackingToken: string }).trackingToken.trim() !== ""
        ) {
          hasNavigated = true;
          router.push(
            `/tickets/track/${encodeURIComponent(
              (ticketData as { trackingToken: string }).trackingToken,
            )}`,
          );
          return;
        }

        if (!isMountedRef.current || joinGenRef.current !== currentJoinGen) {
          return;
        }

        setQueueError({
          queueId,
          message: "Ticket created, but tracking information is unavailable.",
        });
        return;
      }

      if (response.status === 401) {
        hasNavigated = true;
        router.push(
          `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
        );
        return;
      }

      if (response.status === 400) {
        let errJson: unknown = null;
        try {
          errJson = await response.json();
        } catch {
          // Fall back to default safe message
        }

        if (!isMountedRef.current || joinGenRef.current !== currentJoinGen) {
          return;
        }

        const formatted = formatAdmissionErrorMessage(errJson, 400);
        void fetchQueueAvailability(queueId);
        setQueueError({
          queueId,
          message: formatted.message,
          code: formatted.code,
        });
        return;
      }

      if (response.status === 404) {
        setQueueError({
          queueId,
          message:
            "This queue is no longer active or could not be found. Please refresh the page.",
          code: "QUEUE_NOT_FOUND",
        });
        return;
      }

      if (response.status === 409) {
        let errJson: unknown = null;
        try {
          errJson = await response.json();
        } catch {
          // Fall back to default safe message
        }

        if (!isMountedRef.current || joinGenRef.current !== currentJoinGen) {
          return;
        }

        const formatted = formatAdmissionErrorMessage(errJson, 409);
        void fetchQueueAvailability(queueId);
        setQueueError({
          queueId,
          message: formatted.message,
          code: formatted.code,
        });
        return;
      }

      setQueueError({
        queueId,
        message: "Unable to join the queue at this time. Please try again.",
      });
    } catch {
      if (!isMountedRef.current || joinGenRef.current !== currentJoinGen) {
        return;
      }

      setQueueError({
        queueId,
        message:
          "Unable to join the queue at this time. Please check your connection and try again.",
      });
    } finally {
      if (!hasNavigated) {
        isJoiningRef.current = false;
        if (isMountedRef.current && joinGenRef.current === currentJoinGen) {
          setJoiningQueueId(null);
        }
      }
    }
  };

  const handleOpenBookAppointment = (service: PublicService) => {
    if (!organizationId) return;

    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
      );
      return;
    }

    setBookingError(null);
    setBookingSuccessData(null);
    setBookingService(service);
  };

  const handleCloseBookAppointment = () => {
    if (isBooking) return;
    setBookingService(null);
    setBookingError(null);
    setBookingSuccessData(null);
  };

  const handleConfirmBookAppointment = async (scheduledAtIso: string) => {
    if (!organizationId || !bookingService) return;

    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
      );
      return;
    }

    if (isBookingRef.current) return;
    isBookingRef.current = true;
    const currentBookingGen = ++bookingGenRef.current;

    setIsBooking(true);
    setBookingError(null);

    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId: bookingService.id,
          scheduledAt: scheduledAtIso,
        }),
      });

      if (!isMountedRef.current || bookingGenRef.current !== currentBookingGen) {
        return;
      }

      if (response.status === 201) {
        const appointmentData: unknown = await response.json();
        if (
          appointmentData &&
          typeof appointmentData === "object" &&
          "id" in appointmentData &&
          typeof (appointmentData as { id: unknown }).id === "string" &&
          "scheduledAt" in appointmentData &&
          typeof (appointmentData as { scheduledAt: unknown }).scheduledAt ===
            "string"
        ) {
          setBookingSuccessData({
            id: (appointmentData as { id: string }).id,
            serviceId: bookingService.id,
            scheduledAt: (appointmentData as { scheduledAt: string })
              .scheduledAt,
          });
          return;
        }

        setBookingError(
          "Appointment was created, but response was invalid. Please check your appointments.",
        );
        return;
      }

      if (response.status === 401) {
        router.push(
          `/sign-in?redirect_url=${encodeURIComponent(`/organizations/${organizationId}`)}`,
        );
        return;
      }

      if (response.status === 409) {
        let errorMessage =
          "This appointment time slot is already booked. Please choose another time.";
        try {
          const errJson: unknown = await response.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            "error" in errJson &&
            typeof (errJson as { error: unknown }).error === "string"
          ) {
            errorMessage = (errJson as { error: string }).error;
          }
        } catch {
          // fallback to default message
        }

        setBookingError(errorMessage);
        return;
      }

      if (response.status === 400) {
        let errorMessage =
          "Invalid appointment details. Please check your selected time.";
        try {
          const errJson: unknown = await response.json();
          if (
            errJson &&
            typeof errJson === "object" &&
            "details" in errJson &&
            errJson.details &&
            typeof errJson.details === "object" &&
            "fieldErrors" in (errJson.details as Record<string, unknown>)
          ) {
            const fieldErrors = (
              errJson.details as { fieldErrors: Record<string, string[]> }
            ).fieldErrors;
            if (fieldErrors?.scheduledAt?.[0]) {
              errorMessage = fieldErrors.scheduledAt[0];
            }
          } else if (
            errJson &&
            typeof errJson === "object" &&
            "error" in errJson &&
            typeof (errJson as { error: unknown }).error === "string"
          ) {
            errorMessage = (errJson as { error: string }).error;
          }
        } catch {
          // fallback to default message
        }

        setBookingError(errorMessage);
        return;
      }

      if (response.status === 404) {
        setBookingError(
          "This service is no longer available. Please refresh the page.",
        );
        return;
      }

      setBookingError(
        "Unable to book appointment at this time. Please try again.",
      );
    } catch {
      if (!isMountedRef.current || bookingGenRef.current !== currentBookingGen) {
        return;
      }

      setBookingError(
        "Unable to connect to the server. Please check your connection and try again.",
      );
    } finally {
      isBookingRef.current = false;
      if (isMountedRef.current && bookingGenRef.current === currentBookingGen) {
        setIsBooking(false);
      }
    }
  };

  if (isLoading) {
    return <ServicesLoadingSkeleton />;
  }

  if (isNotFound) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">&larr;</span> Back to Organizations
          </Link>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Organization not found
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            The organization you are looking for does not exist or may have been removed.
          </p>
          <div className="mt-6">
            <Link
              href="/organizations"
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              Back to Organizations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="mb-6">
          <Link
            href="/organizations"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">&larr;</span> Back to Organizations
          </Link>
        </div>
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
        >
          <p className="text-base font-medium">{error}</p>
          <button
            type="button"
            onClick={fetchServices}
            className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const loadedAvailability = Object.values(queueAvailability)
    .map((q) => q.data)
    .filter((d): d is QueueAvailabilityData => d !== null);

  const orgStatus =
    loadedAvailability.length > 0 && loadedAvailability[0].organizationStatus
      ? loadedAvailability[0].organizationStatus
      : null;

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
        >
          <span aria-hidden="true">&larr;</span> Back to Organizations
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {data.organization.name}
          </h1>
          <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
            @{data.organization.slug}
          </span>
          {orgStatus !== null && (
            <span
              data-testid="org-status-badge"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                orgStatus.isOpen
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  orgStatus.isOpen ? "bg-emerald-500" : "bg-amber-500"
                }`}
                aria-hidden="true"
              />
              <span>{orgStatus.isOpen ? "Open" : "Closed"}</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-base text-gray-600 sm:text-lg">
          Browse available services and queues for this organization.
        </p>
        {orgStatus && !orgStatus.isOpen && orgStatus.message && (
          <div
            role="status"
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-1.5 text-xs font-medium text-amber-800"
          >
            <svg
              className="h-3.5 w-3.5 shrink-0 text-amber-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <span>{orgStatus.message}</span>
          </div>
        )}
      </div>

      {data.services.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            No services available
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This organization does not currently have any services listed. Please check back later.
          </p>
          <div className="mt-6">
            <Link
              href="/organizations"
              className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
            >
              Back to Organizations
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.services.map((service) => {
            const joinableQueues = service.queues.filter(
              (queue) => queue.isActive !== false,
            );

            return (
              <article
                key={service.id}
                className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                    {service.name}
                  </h2>
                  {service.description && (
                    <p className="mt-2 text-sm text-gray-600">
                      {service.description}
                    </p>
                  )}

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => handleOpenBookAppointment(service)}
                      disabled={!isLoaded}
                      aria-disabled={!isLoaded}
                      aria-label={`Book appointment for ${service.name}`}
                      className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg
                        className="mr-1.5 h-3.5 w-3.5 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
                        />
                      </svg>
                      Book Appointment
                    </button>
                  </div>
                </div>

                <div className="mt-6 border-t border-gray-100 pt-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Active Queues
                  </h3>
                  {joinableQueues.length > 0 ? (
                    <div className="space-y-2.5">
                      {joinableQueues.map((queue) => (
                        <QueueCatalogItem
                          key={queue.id}
                          queue={queue}
                          availability={queueAvailability[queue.id]}
                          isSubmitting={joiningQueueId === queue.id}
                          isAnyQueueSubmitting={
                            joiningQueueId !== null || !isLoaded
                          }
                          queueError={
                            queueError?.queueId === queue.id ? queueError : null
                          }
                          onJoinQueue={handleJoinQueue}
                          onRetryAvailability={fetchQueueAvailability}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-gray-500">
                      No active queues
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {data && (
        <BookAppointmentDialog
          isOpen={Boolean(bookingService)}
          service={bookingService}
          organization={data.organization}
          isSubmitting={isBooking || !isLoaded}
          error={bookingError}
          successData={bookingSuccessData}
          onConfirm={handleConfirmBookAppointment}
          onClose={handleCloseBookAppointment}
        />
      )}
    </div>
  );
}

export default function OrganizationServicesPage({ params }: PageProps) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Suspense fallback={<ServicesLoadingSkeleton />}>
            <OrganizationServicesContent paramsPromise={params} />
          </Suspense>
        </div>
      </main>
    </>
  );
}
