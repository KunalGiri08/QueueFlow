"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ServiceItem } from "./types";

export interface CreateServiceCardProps {
  organizationId: string;
  isDisabled: boolean;
  onServiceCreated: (newService: ServiceItem) => void;
  onCreationFallback: () => void;
}

export function CreateServiceCard({
  organizationId,
  isDisabled,
  onServiceCreated,
  onCreationFallback,
}: CreateServiceCardProps) {
  const router = useRouter();

  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");
  const [newServiceDuration, setNewServiceDuration] = useState("30");
  const [newServiceBuffer, setNewServiceBuffer] = useState("0");
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const [serviceFormSuccess, setServiceFormSuccess] = useState<string | null>(null);

  const activeServiceCreationRequestIdRef = useRef<number>(0);
  const currentOrgIdRef = useRef<string>(organizationId);
  const isCreatingServiceRef = useRef<boolean>(false);

  // Reset form inputs and errors when switching organizations
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setNewServiceName("");
    setNewServiceDescription("");
    setNewServiceDuration("30");
    setNewServiceBuffer("0");
    setServiceFormError(null);
    setServiceFormSuccess(null);
    setIsCreatingService(false);
  }

  useEffect(() => {
    isCreatingServiceRef.current = false;
    currentOrgIdRef.current = organizationId;
    activeServiceCreationRequestIdRef.current += 1;
  }, [organizationId]);

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingServiceRef.current || isDisabled) return;

    const trimmedName = newServiceName.trim();
    if (!trimmedName) {
      setServiceFormError("Service name is required.");
      return;
    }

    let parsedDuration = 30;
    if (newServiceDuration.trim() !== "") {
      const parsed = Number(newServiceDuration.trim());
      if (!Number.isInteger(parsed)) {
        setServiceFormError("Duration minutes must be an integer.");
        return;
      }
      if (parsed < 5) {
        setServiceFormError("Duration must be at least 5 minutes.");
        return;
      }
      if (parsed > 480) {
        setServiceFormError("Duration cannot exceed 480 minutes (8 hours).");
        return;
      }
      parsedDuration = parsed;
    }

    let parsedBuffer = 0;
    if (newServiceBuffer.trim() !== "") {
      const parsed = Number(newServiceBuffer.trim());
      if (!Number.isInteger(parsed)) {
        setServiceFormError("Buffer minutes must be an integer.");
        return;
      }
      if (parsed < 0) {
        setServiceFormError("Buffer minutes cannot be negative.");
        return;
      }
      if (parsed > 240) {
        setServiceFormError("Buffer cannot exceed 240 minutes (4 hours).");
        return;
      }
      parsedBuffer = parsed;
    }

    isCreatingServiceRef.current = true;
    const trimmedDesc = newServiceDescription.trim();
    const creationRequestId = ++activeServiceCreationRequestIdRef.current;
    setIsCreatingService(true);
    setServiceFormError(null);
    setServiceFormSuccess(null);

    const targetOrgId = organizationId;

    const payload: {
      name: string;
      description?: string;
      durationMinutes: number;
      bufferMinutes: number;
    } = {
      name: trimmedName,
      durationMinutes: parsedDuration,
      bufferMinutes: parsedBuffer,
    };
    if (trimmedDesc) {
      payload.description = trimmedDesc;
    }

    try {
      const res = await fetch(
        `/api/organizations/${encodeURIComponent(targetOrgId)}/services`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeServiceCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      if (res.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setServiceFormError(
          data.error ||
            "A service with this name already exists in this organization.",
        );
        return;
      }

      if (res.status === 400) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          details?: {
            fieldErrors?: {
              name?: string[];
              description?: string[];
              durationMinutes?: string[];
              bufferMinutes?: string[];
            };
          };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] ||
          data.details?.fieldErrors?.durationMinutes?.[0] ||
          data.details?.fieldErrors?.bufferMinutes?.[0] ||
          data.details?.fieldErrors?.description?.[0] ||
          data.error ||
          "Invalid service data.";
        setServiceFormError(message);
        return;
      }

      if (res.status === 403) {
        setServiceFormError("Only organization admins can create services.");
        return;
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const newService: unknown = await res.json();

      if (
        currentOrgIdRef.current !== targetOrgId ||
        activeServiceCreationRequestIdRef.current !== creationRequestId
      ) {
        return;
      }

      if (
        typeof newService === "object" &&
        newService !== null &&
        typeof (newService as { id?: unknown }).id === "string" &&
        typeof (newService as { name?: unknown }).name === "string" &&
        ((newService as { description?: unknown }).description === null ||
          typeof (newService as { description?: unknown }).description ===
            "string") &&
        typeof (newService as { organizationId?: unknown })
          .organizationId === "string" &&
        typeof (newService as { createdAt?: unknown }).createdAt ===
          "string" &&
        typeof (newService as { updatedAt?: unknown }).updatedAt === "string"
      ) {
        const validService: ServiceItem = {
          id: (newService as { id: string }).id,
          name: (newService as { name: string }).name,
          description:
            (newService as { description: string | null }).description ?? null,
          organizationId: (newService as { organizationId: string })
            .organizationId,
          isActive:
            typeof (newService as { isActive?: unknown }).isActive === "boolean"
              ? (newService as { isActive: boolean }).isActive
              : true,
          createdAt: (newService as { createdAt: string }).createdAt,
          updatedAt: (newService as { updatedAt: string }).updatedAt,
          admissionCutoffMinutes:
            typeof (newService as { admissionCutoffMinutes?: unknown })
              .admissionCutoffMinutes === "number"
              ? (newService as { admissionCutoffMinutes: number })
                  .admissionCutoffMinutes
              : null,
          durationMinutes:
            typeof (newService as { durationMinutes?: unknown })
              .durationMinutes === "number"
              ? (newService as { durationMinutes: number })
                  .durationMinutes
              : parsedDuration,
          bufferMinutes:
            typeof (newService as { bufferMinutes?: unknown })
              .bufferMinutes === "number"
              ? (newService as { bufferMinutes: number })
                  .bufferMinutes
              : parsedBuffer,
        };

        setNewServiceName("");
        setNewServiceDescription("");
        setNewServiceDuration("30");
        setNewServiceBuffer("0");
        setServiceFormSuccess(
          `Service "${validService.name}" created successfully.`,
        );
        onServiceCreated(validService);
      } else {
        setNewServiceName("");
        setNewServiceDescription("");
        setNewServiceDuration("30");
        setNewServiceBuffer("0");
        setServiceFormSuccess(`Service "${trimmedName}" created successfully.`);
        onCreationFallback();
      }
    } catch {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeServiceCreationRequestIdRef.current === creationRequestId
      ) {
        setServiceFormError(
          "Failed to create service due to a network error. Please try again.",
        );
      }
    } finally {
      if (
        currentOrgIdRef.current === targetOrgId &&
        activeServiceCreationRequestIdRef.current === creationRequestId
      ) {
        isCreatingServiceRef.current = false;
        setIsCreatingService(false);
      }
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Add Service Category
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Create a new service offering (e.g., &ldquo;General Inquiries&rdquo;,
          &ldquo;Technical Support&rdquo;, &ldquo;Consultation&rdquo;).
        </p>
      </div>

      <form onSubmit={handleCreateService} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="new-service-name"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Service Name <span className="text-red-500">*</span>
            </label>
            <input
              id="new-service-name"
              type="text"
              value={newServiceName}
              onChange={(e) => {
                setNewServiceName(e.target.value);
                if (serviceFormError) setServiceFormError(null);
                if (serviceFormSuccess) setServiceFormSuccess(null);
              }}
              placeholder="e.g., Account Services"
              disabled={isCreatingService}
              aria-invalid={Boolean(serviceFormError)}
              aria-describedby={
                serviceFormError
                  ? "service-form-error"
                  : serviceFormSuccess
                  ? "service-form-success"
                  : undefined
              }
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label
              htmlFor="new-service-description"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Description <span className="text-gray-400">(Optional)</span>
            </label>
            <input
              id="new-service-description"
              type="text"
              value={newServiceDescription}
              onChange={(e) => {
                setNewServiceDescription(e.target.value);
                if (serviceFormError) setServiceFormError(null);
                if (serviceFormSuccess) setServiceFormSuccess(null);
              }}
              placeholder="e.g., Assistance with account verification"
              disabled={isCreatingService}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="new-service-duration"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Appointment Duration (Minutes)
            </label>
            <input
              id="new-service-duration"
              type="number"
              min="5"
              max="480"
              value={newServiceDuration}
              onChange={(e) => {
                setNewServiceDuration(e.target.value);
                if (serviceFormError) setServiceFormError(null);
                if (serviceFormSuccess) setServiceFormSuccess(null);
              }}
              placeholder="30"
              disabled={isCreatingService}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Expected appointment duration (5–480 mins). Default is 30.
            </p>
          </div>

          <div>
            <label
              htmlFor="new-service-buffer"
              className="block text-xs font-medium text-gray-700 mb-1"
            >
              Buffer Time (Minutes)
            </label>
            <input
              id="new-service-buffer"
              type="number"
              min="0"
              max="240"
              value={newServiceBuffer}
              onChange={(e) => {
                setNewServiceBuffer(e.target.value);
                if (serviceFormError) setServiceFormError(null);
                if (serviceFormSuccess) setServiceFormSuccess(null);
              }}
              placeholder="0"
              disabled={isCreatingService}
              className="w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Additional time between consecutive appointment slots (0–240 mins).
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isCreatingService || !newServiceName.trim()}
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
          >
            {isCreatingService ? (
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
              "Create Service"
            )}
          </button>
        </div>

        {serviceFormError && (
          <div
            id="service-form-error"
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
            <span>{serviceFormError}</span>
          </div>
        )}

        {serviceFormSuccess && (
          <div
            id="service-form-success"
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
            <span>{serviceFormSuccess}</span>
          </div>
        )}
      </form>
    </div>
  );
}
