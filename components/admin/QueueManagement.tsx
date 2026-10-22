"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { formatCreationDate } from "@/lib/formatters/date";

export interface QueueItem {
  id: string;
  name: string;
  serviceId: string;
  nextTicketNumber: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOption {
  id: string;
  name: string;
  description: string | null;
  organizationId: string;
  isActive?: boolean;
}

export interface QueueManagementProps {
  organizationId: string;
}

function QueuesSkeleton() {
  return (
    <div
      aria-label="Loading queues"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse"
    >
      {Array.from({ length: 3 }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-32 rounded bg-gray-200" />
            <div className="h-4 w-16 rounded-full bg-gray-200" />
          </div>
          <div className="h-3 w-40 rounded bg-gray-100" />
          <div className="h-3 w-24 rounded bg-gray-100 pt-2" />
        </div>
      ))}
    </div>
  );
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
 * Queue Management module for organization administrators.
 * Allows administrators to select a service category, view active queues,
 * and create new queues under that service.
 */
export function QueueManagement({ organizationId }: QueueManagementProps) {
  const router = useRouter();

  // Services listing state (needed to associate queues with a service)
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesOrgId, setServicesOrgId] = useState<string | null>(null);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [servicesRetryTrigger, setServicesRetryTrigger] = useState(0);

  // Selected service state
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  // Queues listing state
  const [queues, setQueues] = useState<QueueItem[]>([]);
  const [queuesServiceId, setQueuesServiceId] = useState<string | null>(null);
  const [queuesError, setQueuesError] = useState<string | null>(null);
  const [queuesRetryTrigger, setQueuesRetryTrigger] = useState(0);

  // Queue creation form state
  const [newQueueName, setNewQueueName] = useState("");
  const [isCreatingQueue, setIsCreatingQueue] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Queue activation/deactivation operational states
  const [updatingQueueId, setUpdatingQueueId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Concurrency & lifecycle refs
  const activeServicesControllerRef = useRef<AbortController | null>(null);
  const activeQueuesControllerRef = useRef<AbortController | null>(null);
  const servicesFetchGenRef = useRef<number>(0);
  const queuesFetchGenRef = useRef<number>(0);
  const activeCreationRequestIdRef = useRef<number>(0);
  const activeActionRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);
  const currentServiceIdRef = useRef<string | null>(selectedServiceId);
  const isCreatingQueueRef = useRef<boolean>(false);

  // Reset form and selections when switching organizations
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setServices([]);
    setServicesOrgId(null);
    setServicesError(null);
    setSelectedServiceId(null);
    setQueues([]);
    setQueuesServiceId(null);
    setQueuesError(null);
    setNewQueueName("");
    setFormError(null);
    setFormSuccess(null);
    setIsCreatingQueue(false);
    setUpdatingQueueId(null);
    setActionError(null);
    setActionSuccess(null);
  }

  // Synchronize currentOrgIdRef with prop
  useEffect(() => {
    isCreatingQueueRef.current = false;
    currentOrgIdRef.current = organizationId;
    currentServiceIdRef.current = null;
    activeCreationRequestIdRef.current += 1;
    activeActionRequestIdRef.current += 1;
  }, [organizationId]);

  // Synchronize currentServiceIdRef with state
  useEffect(() => {
    currentServiceIdRef.current = selectedServiceId;
  }, [selectedServiceId]);

  // Fetch services for the organization to populate the service selector
  useEffect(() => {
    if (activeServicesControllerRef.current) {
      activeServicesControllerRef.current.abort();
    }
    if (activeQueuesControllerRef.current) {
      activeQueuesControllerRef.current.abort();
      activeQueuesControllerRef.current = null;
    }

    let isCurrent = true;
    const fetchGen = ++servicesFetchGenRef.current;
    const controller = new AbortController();
    activeServicesControllerRef.current = controller;

    fetch(`/api/organizations/${encodeURIComponent(organizationId)}/services`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!isCurrent || servicesFetchGenRef.current !== fetchGen) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load services (status ${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Malformed services response");
        }

        const validated: ServiceOption[] = [];
        for (const s of data) {
          if (
            typeof s === "object" &&
            s !== null &&
            typeof (s as { id?: unknown }).id === "string" &&
            typeof (s as { name?: unknown }).name === "string" &&
            ((s as { description?: unknown }).description === null ||
              typeof (s as { description?: unknown }).description === "string") &&
            typeof (s as { organizationId?: unknown }).organizationId === "string"
          ) {
            validated.push({
              id: (s as { id: string }).id,
              name: (s as { name: string }).name,
              description:
                (s as { description: string | null }).description ?? null,
              organizationId: (s as { organizationId: string }).organizationId,
              isActive:
                typeof (s as { isActive?: unknown }).isActive === "boolean"
                  ? (s as { isActive: boolean }).isActive
                  : true,
            });
          }
        }

        validated.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

        if (!isCurrent || servicesFetchGenRef.current !== fetchGen) return;

        setServices(validated);
        setServicesOrgId(organizationId);
        setServicesError(null);

        // Select first service if previous selection is no longer valid
        setSelectedServiceId((current) => {
          if (current && validated.some((s) => s.id === current)) {
            return current;
          }
          return validated.length > 0 ? validated[0].id : null;
        });
      })
      .catch((err: unknown) => {
        if (!isCurrent || servicesFetchGenRef.current !== fetchGen) return;
        if (
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: unknown }).name === "AbortError") ||
          controller.signal.aborted
        ) {
          return;
        }
        setServicesOrgId(organizationId);
        setServicesError(
          "Unable to load service categories at this time. Please try again.",
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [organizationId, servicesRetryTrigger, router]);

  // Fetch queues for the selected service
  useEffect(() => {
    if (!selectedServiceId) {
      if (activeQueuesControllerRef.current) {
        activeQueuesControllerRef.current.abort();
        activeQueuesControllerRef.current = null;
      }
      return;
    }

    if (activeQueuesControllerRef.current) {
      activeQueuesControllerRef.current.abort();
    }

    let isCurrent = true;
    const fetchGen = ++queuesFetchGenRef.current;
    const controller = new AbortController();
    activeQueuesControllerRef.current = controller;

    fetch(
      `/api/organizations/${encodeURIComponent(organizationId)}/services/${encodeURIComponent(selectedServiceId)}/queues`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!isCurrent || queuesFetchGenRef.current !== fetchGen) return;

        if (res.status === 401) {
          router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load queues (status ${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Malformed queues response");
        }

        const validated: QueueItem[] = data.filter(
          (q): q is QueueItem =>
            typeof q === "object" &&
            q !== null &&
            typeof (q as { id?: unknown }).id === "string" &&
            typeof (q as { name?: unknown }).name === "string" &&
            typeof (q as { serviceId?: unknown }).serviceId === "string" &&
            typeof (q as { nextTicketNumber?: unknown }).nextTicketNumber === "number" &&
            typeof (q as { isActive?: unknown }).isActive === "boolean" &&
            typeof (q as { createdAt?: unknown }).createdAt === "string" &&
            typeof (q as { updatedAt?: unknown }).updatedAt === "string",
        );

        validated.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        );

        if (!isCurrent || queuesFetchGenRef.current !== fetchGen) return;

        setQueues(validated);
        setQueuesServiceId(selectedServiceId);
        setQueuesError(null);
      })
      .catch((err: unknown) => {
        if (!isCurrent || queuesFetchGenRef.current !== fetchGen) return;
        if (
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" &&
            err !== null &&
            "name" in err &&
            (err as { name: unknown }).name === "AbortError") ||
          controller.signal.aborted
        ) {
          return;
        }
        setQueuesServiceId(selectedServiceId);
        setQueuesError(
          "Unable to load queues for this service category. Please try again.",
        );
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [organizationId, selectedServiceId, queuesRetryTrigger, router]);

  const handleRetryServices = () => {
    setServicesOrgId(null);
    setServicesError(null);
    setServicesRetryTrigger((prev) => prev + 1);
  };

  const handleRetryQueues = () => {
    setQueuesServiceId(null);
    setQueuesError(null);
    setActionError(null);
    setActionSuccess(null);
    setQueuesRetryTrigger((prev) => prev + 1);
  };

  const handleSelectService = (newServiceId: string) => {
    setSelectedServiceId(newServiceId);
    currentServiceIdRef.current = newServiceId;
    activeCreationRequestIdRef.current += 1;
    activeActionRequestIdRef.current += 1;
    isCreatingQueueRef.current = false;
    setIsCreatingQueue(false);
    setUpdatingQueueId(null);
    setActionError(null);
    setActionSuccess(null);
    setNewQueueName("");
    setFormError(null);
    setFormSuccess(null);
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId || isCreatingQueueRef.current) return;

    const trimmed = newQueueName.trim();
    if (!trimmed) {
      setFormError("Queue name is required.");
      return;
    }

    isCreatingQueueRef.current = true;
    const creationRequestId = ++activeCreationRequestIdRef.current;
    setIsCreatingQueue(true);
    setFormError(null);
    setFormSuccess(null);

    const targetOrgId = organizationId;
    const targetServiceId = selectedServiceId;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services/${encodeURIComponent(targetServiceId)}/queues`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name: trimmed }),
        },
      );

      // Verify the user is still on the same organization, service, and active request
      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(
          data.error || "A queue with this name already exists in this service.",
        );
        return;
      }

      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: { name?: string[] } };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] || data.error || "Invalid queue name.";
        setFormError(message);
        return;
      }

      if (res.status === 403) {
        setFormError("Only organization admins can create queues.");
        return;
      }

      if (res.status === 404) {
        setFormError("The selected service was not found. Please refresh and try again.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const newQueue: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      // Cancel any in-flight GET requests and bump fetch generation so older GET responses cannot overwrite this creation
      queuesFetchGenRef.current += 1;
      if (activeQueuesControllerRef.current) {
        activeQueuesControllerRef.current.abort();
        activeQueuesControllerRef.current = null;
      }

      if (
        typeof newQueue === "object" &&
        newQueue !== null &&
        typeof (newQueue as { id?: unknown }).id === "string" &&
        typeof (newQueue as { name?: unknown }).name === "string" &&
        typeof (newQueue as { serviceId?: unknown }).serviceId === "string" &&
        typeof (newQueue as { nextTicketNumber?: unknown }).nextTicketNumber === "number" &&
        typeof (newQueue as { isActive?: unknown }).isActive === "boolean" &&
        typeof (newQueue as { createdAt?: unknown }).createdAt === "string" &&
        typeof (newQueue as { updatedAt?: unknown }).updatedAt === "string"
      ) {
        const validQueue = newQueue as QueueItem;
        setQueues((prev) => {
          const updated = [...prev, validQueue];
          updated.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true }),
          );
          return updated;
        });
        setNewQueueName("");
        setFormSuccess(`Queue "${validQueue.name}" created successfully.`);
      } else {
        handleRetryQueues();
        setNewQueueName("");
        setFormSuccess(`Queue "${trimmed}" created successfully.`);
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        currentServiceIdRef.current === targetServiceId &&
        activeCreationRequestIdRef.current === creationRequestId
      ) {
        setFormError(
          "Failed to create queue due to a network error. Please try again.",
        );
      }
    } finally {
      if (
        currentOrgIdRef.current === targetOrgId &&
        currentServiceIdRef.current === targetServiceId &&
        activeCreationRequestIdRef.current === creationRequestId
      ) {
        isCreatingQueueRef.current = false;
        setIsCreatingQueue(false);
      }
    }
  };

  const handleToggleQueueStatus = async (queue: QueueItem) => {
    if (updatingQueueId || isQueuesLoading || !selectedServiceId) return;

    setActionError(null);
    setActionSuccess(null);
    setUpdatingQueueId(queue.id);

    const actionRequestId = ++activeActionRequestIdRef.current;
    const targetOrgId = organizationId;
    const targetServiceId = selectedServiceId;
    const targetIsActive = !queue.isActive;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services/${encodeURIComponent(targetServiceId)}/queues/${encodeURIComponent(queue.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ isActive: targetIsActive }),
        },
      );

      // Verify the user is still on the same organization, service, and active request
      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeActionRequestIdRef.current !== actionRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(
          data.error ||
            `Failed to ${targetIsActive ? "activate" : "deactivate"} queue "${queue.name}".`,
        );
        return;
      }

      const updated: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeActionRequestIdRef.current !== actionRequestId
      ) {
        return;
      }

      if (
        typeof updated === "object" &&
        updated !== null &&
        typeof (updated as { id?: unknown }).id === "string" &&
        typeof (updated as { isActive?: unknown }).isActive === "boolean"
      ) {
        const validUpdated = updated as QueueItem;
        setQueues((prev) =>
          prev.map((q) =>
            q.id === queue.id ? { ...q, isActive: validUpdated.isActive } : q,
          ),
        );
        setActionSuccess(
          `Queue "${queue.name}" ${
            validUpdated.isActive ? "activated" : "deactivated"
          } successfully.`,
        );
      } else {
        setQueues((prev) =>
          prev.map((q) =>
            q.id === queue.id ? { ...q, isActive: targetIsActive } : q,
          ),
        );
        setActionSuccess(
          `Queue "${queue.name}" ${
            targetIsActive ? "activated" : "deactivated"
          } successfully.`,
        );
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        currentServiceIdRef.current === targetServiceId &&
        activeActionRequestIdRef.current === actionRequestId
      ) {
        setActionError(
          `Failed to ${targetIsActive ? "activate" : "deactivate"} queue due to a network error. Please try again.`,
        );
      }
    } finally {
      if (activeActionRequestIdRef.current === actionRequestId) {
        setUpdatingQueueId(null);
      }
    }
  };

  const isServicesLoading = Boolean(servicesOrgId !== organizationId);
  const isQueuesLoading = Boolean(
    selectedServiceId !== null && queuesServiceId !== selectedServiceId,
  );
  const displayedQueues = queuesServiceId === selectedServiceId ? queues : [];
  const selectedService = services.find((s) => s.id === selectedServiceId) ?? null;

  return (
    <div className="space-y-6">
      {/* Queue Section Header & Controls */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-gray-900">
              Queue Management
            </h2>
            {!isServicesLoading &&
              !isQueuesLoading &&
              selectedServiceId &&
              !queuesError && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                  {displayedQueues.length}{" "}
                  {displayedQueues.length === 1 ? "active queue" : "active queues"}
                </span>
              )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Create and manage customer service queues for walk-ins and appointment tickets.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            handleRetryServices();
            handleRetryQueues();
          }}
          disabled={isServicesLoading || isQueuesLoading || isCreatingQueue}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
          aria-label="Refresh queues and service categories"
        >
          <svg
            className={`h-3.5 w-3.5 text-gray-500 ${
              isServicesLoading || isQueuesLoading ? "animate-spin" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Service Category Selector / Prerequisites */}
      {isServicesLoading ? (
        <ServicesSkeleton />
      ) : servicesError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
        >
          <p className="text-sm font-medium">{servicesError}</p>
          <button
            type="button"
            onClick={handleRetryServices}
            className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            Retry Loading Service Categories
          </button>
        </div>
      ) : services.length === 0 ? (
        /* Empty State: No services exist yet */
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
      ) : (
        /* Active Services Selector & Queue Operations */
        <div className="space-y-6">
          {/* Service Selector Card */}
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
                  onChange={(e) => handleSelectService(e.target.value)}
                  disabled={isCreatingQueue}
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

          {/* Create Queue Card */}
          {selectedService && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  Add Queue to {selectedService.name}
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Enter a unique queue name for this service (e.g., &ldquo;General Walk-in&rdquo;, &ldquo;Priority / Accessible&rdquo;, &ldquo;Fast Track&rdquo;).
                </p>
              </div>

              <form onSubmit={handleCreateQueue} className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <label htmlFor="new-queue-name" className="sr-only">
                      Queue Name
                    </label>
                    <input
                      id="new-queue-name"
                      type="text"
                      value={newQueueName}
                      onChange={(e) => {
                        setNewQueueName(e.target.value);
                        if (formError) setFormError(null);
                        if (formSuccess) setFormSuccess(null);
                      }}
                      placeholder="e.g., General Walk-in or Priority Desk"
                      disabled={isCreatingQueue}
                      aria-invalid={Boolean(formError)}
                      aria-describedby={
                        formError
                          ? "queue-form-error"
                          : formSuccess
                          ? "queue-form-success"
                          : undefined
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isCreatingQueue || !newQueueName.trim()}
                    className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none sm:w-auto"
                  >
                    {isCreatingQueue ? (
                      <>
                        <svg
                          className="mr-2 h-4 w-4 animate-spin text-white"
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
                        Creating...
                      </>
                    ) : (
                      "Create Queue"
                    )}
                  </button>
                </div>

                {formError && (
                  <div
                    id="queue-form-error"
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50/80 p-3 text-xs font-medium text-red-800 flex items-center gap-2"
                  >
                    <svg
                      className="h-4 w-4 text-red-600 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
                      />
                    </svg>
                    <span>{formError}</span>
                  </div>
                )}

                {formSuccess && (
                  <div
                    id="queue-form-success"
                    role="status"
                    className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-xs font-medium text-emerald-800 flex items-center gap-2"
                  >
                    <svg
                      className="h-4 w-4 text-emerald-600 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    <span>{formSuccess}</span>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* Global Queue Action Feedback Alerts */}
          {actionError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3.5 text-xs sm:text-sm font-medium text-red-800 shadow-sm flex items-start justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-red-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
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
                className="text-red-600 hover:text-red-900 text-xs font-semibold shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {actionSuccess && (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs sm:text-sm font-medium text-emerald-800 shadow-sm flex items-start justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 text-emerald-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
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
                className="text-emerald-600 hover:text-emerald-900 text-xs font-semibold shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Queues List State Container */}
          <div>
            {isQueuesLoading ? (
              <QueuesSkeleton />
            ) : queuesError ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
              >
                <p className="text-sm font-medium">{queuesError}</p>
                <button
                  type="button"
                  onClick={handleRetryQueues}
                  className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                >
                  Retry Loading Queues
                </button>
              </div>
            ) : displayedQueues.length === 0 ? (
              /* Empty State: No queues for this service */
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
                  No Active Queues for {selectedService?.name || "this Service"}
                </h4>
                <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                  Add your first queue above to allow customers to join and staff operators to call tickets for this category.
                </p>
              </div>
            ) : (
              /* Populated State: Grid of Queues */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displayedQueues.map((queue) => {
                  const isQueueUpdating = updatingQueueId === queue.id;
                  const isAnyQueueUpdating = Boolean(updatingQueueId);

                  return (
                    <div
                      key={queue.id}
                      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <h4 className="text-base font-semibold text-gray-900">
                              {queue.name}
                            </h4>
                            <span className="block font-mono text-xs text-gray-400">
                              ID: {queue.id}
                            </span>
                          </div>
                          {queue.isActive ? (
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

                        <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          <span className="font-medium text-gray-500">
                            Next Ticket Number
                          </span>
                          <span className="font-mono font-bold text-gray-900">
                            #{queue.nextTicketNumber}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-400">
                        <span>{formatCreationDate(queue.createdAt)}</span>
                        <button
                          type="button"
                          onClick={() => handleToggleQueueStatus(queue)}
                          disabled={
                            isAnyQueueUpdating ||
                            isQueuesLoading ||
                            isServicesLoading ||
                            isCreatingQueue
                          }
                          aria-label={`${
                            queue.isActive ? "Deactivate" : "Activate"
                          } ${queue.name}`}
                          className={`inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                            queue.isActive
                              ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:text-red-700 hover:border-red-200"
                              : "border-gray-300 bg-white text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                          }`}
                        >
                          {isQueueUpdating ? (
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
                              {queue.isActive
                                ? "Deactivating..."
                                : "Activating..."}
                            </>
                          ) : queue.isActive ? (
                            "Deactivate"
                          ) : (
                            "Activate"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
