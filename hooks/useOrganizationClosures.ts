"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ClosureItem } from "@/components/admin/operating-hours/types";
import type { ClosureFormData } from "@/components/admin/operating-hours/ClosureDialog";

export interface UseOrganizationClosuresOptions {
  organizationId: string;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  confirmDialog?: (message: string) => boolean;
}

export interface UseOrganizationClosuresReturn {
  closures: ClosureItem[];
  isLoading: boolean;
  error: string | null;
  deletingClosureId: string | null;
  fetchClosures: (signal?: AbortSignal) => Promise<void>;
  saveClosure: (
    data: ClosureFormData,
    editingClosure?: ClosureItem | null,
  ) => Promise<ClosureItem>;
  deleteClosure: (closure: ClosureItem) => Promise<boolean>;
}

export function useOrganizationClosures({
  organizationId,
  onSuccess,
  onError,
  confirmDialog,
}: UseOrganizationClosuresOptions): UseOrganizationClosuresReturn {
  const router = useRouter();
  const routerRef = useRef(router);

  // Update routerRef after every render so callbacks always hold the latest router
  // instance without being listed as a useCallback dependency.
  useEffect(() => {
    routerRef.current = router;
  });

  const [closures, setClosures] = useState<ClosureItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingClosureId, setDeletingClosureId] = useState<string | null>(null);

  const fetchGenRef = useRef<number>(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  // Reset state when switching organization
  const [prevOrgId, setPrevOrgId] = useState(organizationId);
  if (organizationId !== prevOrgId) {
    setPrevOrgId(organizationId);
    setClosures([]);
    setError(null);
    setDeletingClosureId(null);
  }

  const confirmFn =
    confirmDialog ??
    (typeof window !== "undefined" && typeof window.confirm === "function"
      ? window.confirm.bind(window)
      : () => true);

  // Fetch closures
  const fetchClosures = useCallback(
    async (signal?: AbortSignal) => {
      if (signal?.aborted) return;
      const gen = ++fetchGenRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/closures`,
          { signal },
        );

        if (signal?.aborted || fetchGenRef.current !== gen) return;

        if (res.status === 401) {
          routerRef.current.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
          return;
        }

        if (res.status === 403) {
          setError("Administrator permissions required to view closures.");
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load organization closures (${res.status})`);
        }

        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          throw new Error("Invalid closures payload");
        }

        const validated: ClosureItem[] = data.filter(
          (item): item is ClosureItem =>
            typeof item === "object" &&
            item !== null &&
            typeof item.id === "string" &&
            typeof item.organizationId === "string" &&
            typeof item.startDate === "string" &&
            typeof item.endDate === "string",
        );

        if (signal?.aborted || fetchGenRef.current !== gen) return;
        setClosures(validated);
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
        setError("Failed to load organization closures. Please try again.");
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

    void fetchClosures(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchClosures]);

  // Save closure (POST new or PATCH existing)
  const saveClosure = useCallback(
    async (
      data: ClosureFormData,
      editingClosure?: ClosureItem | null,
    ): Promise<ClosureItem> => {
      if (editingClosure) {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(
            organizationId,
          )}/closures/${encodeURIComponent(editingClosure.id)}`,
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
          throw new Error(errData?.error || "Failed to update closure");
        }

        const updated: ClosureItem = await res.json();
        setClosures((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
        onSuccess?.("Closure updated successfully.");
        return updated;
      } else {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(organizationId)}/closures`,
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
          throw new Error(errData?.error || "Failed to create closure");
        }

        const created: ClosureItem = await res.json();
        setClosures((prev) => [...prev, created]);
        onSuccess?.("Closure created successfully.");
        return created;
      }
    },
    [organizationId, onSuccess],
  );

  // Delete closure
  const deleteClosure = useCallback(
    async (closure: ClosureItem): Promise<boolean> => {
      const confirmed = confirmFn(
        `Are you sure you want to remove the closure from ${closure.startDate} to ${closure.endDate}?`,
      );
      if (!confirmed) {
        return false;
      }

      setDeletingClosureId(closure.id);

      try {
        const res = await fetch(
          `/api/organizations/${encodeURIComponent(
            organizationId,
          )}/closures/${encodeURIComponent(closure.id)}`,
          {
            method: "DELETE",
          },
        );

        if (!res.ok && res.status !== 204) {
          const errData = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(errData?.error || "Failed to delete closure");
        }

        setClosures((prev) => prev.filter((c) => c.id !== closure.id));
        onSuccess?.("Closure deleted successfully.");
        return true;
      } catch (err: unknown) {
        onError?.(
          err instanceof Error ? err.message : "Failed to delete closure",
        );
        return false;
      } finally {
        setDeletingClosureId(null);
      }
    },
    [confirmFn, organizationId, onSuccess, onError],
  );

  return {
    closures,
    isLoading,
    error,
    deletingClosureId,
    fetchClosures,
    saveClosure,
    deleteClosure,
  };
}
