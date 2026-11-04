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

    isCreatingServiceRef.current = true;
    const trimmedDesc = newServiceDescription.trim();
    const creationRequestId = ++activeServiceCreationRequestIdRef.current;
    setIsCreatingService(true);
    setServiceFormError(null);
    setServiceFormSuccess(null);

    const targetOrgId = organizationId;

    const payload: { name: string; description?: string } = {
      name: trimmedName,
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
            fieldErrors?: { name?: string[]; description?: string[] };
          };
        };
        const message =
          data.details?.fieldErrors?.name?.[0] ||
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
        };

        setNewServiceName("");
        setNewServiceDescription("");
        setServiceFormSuccess(
          `Service "${validService.name}" created successfully.`,
        );
        onServiceCreated(validService);
      } else {
        setNewServiceName("");
        setNewServiceDescription("");
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

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isCreatingService || !newServiceName.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
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
