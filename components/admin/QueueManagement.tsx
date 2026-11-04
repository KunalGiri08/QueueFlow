"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  QueueItem,
  ServiceOption,
  QueueManagementProps,
  CreateQueuePayload,
  UpdateQueuePayload,
} from "./queues/types";
import {
  sortQueuesByName,
  normalizeQueueItem,
  parseQueueApiError,
} from "./queues/validation";
import { QueueCard } from "./queues/QueueCard";
import { ServiceSelectorCard } from "./queues/ServiceSelectorCard";
import { EditQueueDialog } from "./queues/EditQueueDialog";
import { CreateQueueCard } from "./queues/CreateQueueCard";

// Re-export types for backward compatibility with external callers and tests
export type { QueueItem, ServiceOption, QueueManagementProps };

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

  // Queue creation state
  const [isCreatingQueue, setIsCreatingQueue] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Queue activation/deactivation operational states
  const [updatingQueueId, setUpdatingQueueId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Queue editing modal state
  const [editingQueue, setEditingQueue] = useState<QueueItem | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Concurrency & lifecycle refs
  const activeServicesControllerRef = useRef<AbortController | null>(null);
  const activeQueuesControllerRef = useRef<AbortController | null>(null);
  const servicesFetchGenRef = useRef<number>(0);
  const queuesFetchGenRef = useRef<number>(0);
  const activeCreationRequestIdRef = useRef<number>(0);
  const activeActionRequestIdRef = useRef<number>(0);
  const activeEditRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);
  const currentServiceIdRef = useRef<string | null>(selectedServiceId);
  const isCreatingQueueRef = useRef<boolean>(false);
  const isSavingEditRef = useRef<boolean>(false);

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
    setFormError(null);
    setFormSuccess(null);
    setIsCreatingQueue(false);
    setUpdatingQueueId(null);
    setActionError(null);
    setActionSuccess(null);
    setEditingQueue(null);
    setEditError(null);
    setIsSavingEdit(false);
  }

  // Synchronize currentOrgIdRef with prop
  useEffect(() => {
    isCreatingQueueRef.current = false;
    isSavingEditRef.current = false;
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

        const validated: QueueItem[] = data
          .filter(
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
          )
          .map(normalizeQueueItem);

        const sorted = sortQueuesByName(validated);

        if (!isCurrent || queuesFetchGenRef.current !== fetchGen) return;

        setQueues(sorted);
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
    setFormError(null);
    setFormSuccess(null);
    setEditingQueue(null);
    setEditError(null);
    setIsSavingEdit(false);
    isSavingEditRef.current = false;
  };

  const handleCreateQueue = async (
    payload: CreateQueuePayload,
  ): Promise<boolean> => {
    if (!selectedServiceId || isCreatingQueueRef.current) return false;

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
          body: JSON.stringify(payload),
        },
      );

      // Verify the user is still on the same organization, service, and active request
      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeCreationRequestIdRef.current !== creationRequestId
      ) {
        return false;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return false;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(
          data.error || "A queue with this name already exists in this service.",
        );
        return false;
      }

      if (res.status === 400) {
        const data: unknown = await res.json().catch(() => ({}));
        setFormError(parseQueueApiError(data));
        return false;
      }

      if (res.status === 403) {
        setFormError("Only organization admins can create queues.");
        return false;
      }

      if (res.status === 404) {
        setFormError("The selected service was not found. Please refresh and try again.");
        return false;
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
        return false;
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
        const validQueue = normalizeQueueItem(newQueue as QueueItem);
        setQueues((prev) => sortQueuesByName([...prev, validQueue]));
        setFormSuccess(`Queue "${validQueue.name}" created successfully.`);
        return true;
      } else {
        handleRetryQueues();
        setFormSuccess(`Queue "${payload.name}" created successfully.`);
        return true;
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
      return false;
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

  const handleOpenEdit = (queue: QueueItem) => {
    setEditingQueue(queue);
    setEditError(null);
  };

  const handleCloseEdit = () => {
    if (isSavingEditRef.current) return;
    setEditingQueue(null);
    setEditError(null);
  };

  const handleSaveEdit = async (payload: UpdateQueuePayload) => {
    if (!editingQueue || isSavingEditRef.current || !selectedServiceId) return;

    isSavingEditRef.current = true;
    const editRequestId = ++activeEditRequestIdRef.current;
    setIsSavingEdit(true);
    setEditError(null);

    const targetOrgId = organizationId;
    const targetServiceId = selectedServiceId;
    const targetQueueId = editingQueue.id;

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services/${encodeURIComponent(targetServiceId)}/queues/${encodeURIComponent(targetQueueId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeEditRequestIdRef.current !== editRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setEditError(
          data.error || "A queue with this name already exists for this service.",
        );
        return;
      }

      if (res.status === 400) {
        const data: unknown = await res.json().catch(() => ({}));
        setEditError(parseQueueApiError(data));
        return;
      }

      if (res.status === 403) {
        setEditError("Only organization admins can update queues.");
        return;
      }

      if (res.status === 404) {
        setEditError("Queue not found. Please refresh and try again.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const updatedQueue: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        currentServiceIdRef.current !== targetServiceId ||
        activeEditRequestIdRef.current !== editRequestId
      ) {
        return;
      }

      if (
        typeof updatedQueue === "object" &&
        updatedQueue !== null &&
        typeof (updatedQueue as { id?: unknown }).id === "string" &&
        typeof (updatedQueue as { name?: unknown }).name === "string" &&
        typeof (updatedQueue as { serviceId?: unknown }).serviceId === "string" &&
        typeof (updatedQueue as { nextTicketNumber?: unknown }).nextTicketNumber === "number" &&
        typeof (updatedQueue as { isActive?: unknown }).isActive === "boolean" &&
        typeof (updatedQueue as { createdAt?: unknown }).createdAt === "string" &&
        typeof (updatedQueue as { updatedAt?: unknown }).updatedAt === "string"
      ) {
        const validUpdated = normalizeQueueItem(updatedQueue as QueueItem);
        setQueues((prev) =>
          sortQueuesByName(
            prev.map((q) => (q.id === targetQueueId ? validUpdated : q)),
          ),
        );
        setEditingQueue(null);
        setActionSuccess(`Queue "${validUpdated.name}" updated successfully.`);
      } else {
        handleRetryQueues();
        setEditingQueue(null);
        setActionSuccess(`Queue "${payload.name}" updated successfully.`);
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        currentServiceIdRef.current === targetServiceId &&
        activeEditRequestIdRef.current === editRequestId
      ) {
        setEditError(
          "Failed to update queue due to a network error. Please try again.",
        );
      }
    } finally {
      if (activeEditRequestIdRef.current === editRequestId) {
        isSavingEditRef.current = false;
        setIsSavingEdit(false);
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
      <ServiceSelectorCard
        services={services}
        selectedServiceId={selectedServiceId}
        isLoading={isServicesLoading}
        error={servicesError}
        isDisabled={isCreatingQueue}
        onSelectService={handleSelectService}
        onRetry={handleRetryServices}
      />

      {/* Active Services Operations */}
      {!isServicesLoading && !servicesError && services.length > 0 && (
        <div className="space-y-6">
          {/* Create Queue Card */}
          {selectedService && (
            <CreateQueueCard
              serviceId={selectedService.id}
              serviceName={selectedService.name}
              isCreating={isCreatingQueue}
              formError={formError}
              formSuccess={formSuccess}
              onCreateQueue={handleCreateQueue}
              onClearError={() => setFormError(null)}
              onClearSuccess={() => setFormSuccess(null)}
            />
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
                  const isCardDisabled =
                    isAnyQueueUpdating ||
                    isQueuesLoading ||
                    isServicesLoading ||
                    isCreatingQueue ||
                    isSavingEdit;

                  return (
                    <QueueCard
                      key={queue.id}
                      queue={queue}
                      isUpdating={isQueueUpdating}
                      isDisabled={isCardDisabled}
                      onEdit={handleOpenEdit}
                      onToggleStatus={handleToggleQueueStatus}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Queue Modal Dialog */}
      <EditQueueDialog
        queue={editingQueue}
        isOpen={Boolean(editingQueue)}
        isSaving={isSavingEdit}
        error={editError}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
        onClearError={() => setEditError(null)}
      />
    </div>
  );
}
