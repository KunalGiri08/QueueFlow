"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type { OrganizationItem } from "@/components/staff/StaffOrgSelector";

export interface CurrentUser {
  id: string;
  name: string | null;
  email: string;
}

export interface UseStaffSessionOptions {
  /**
   * Optional custom redirect URL for unauthenticated users.
   * Defaults to "/sign-in?redirect_url=/staff"
   */
  signInRedirectUrl?: string;
}

export interface UseStaffSessionReturn {
  user: CurrentUser | null;
  organizations: OrganizationItem[];
  selectedOrgId: string | null;
  selectedOrganization: OrganizationItem | null;
  isLoading: boolean;
  error: string | null;
  setSelectedOrgId: (orgId: string | null) => void;
  retrySession: () => Promise<void>;
}

export function useStaffSession(
  options?: UseStaffSessionOptions,
): UseStaffSessionReturn {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sessionAbortControllerRef = useRef<AbortController | null>(null);
  const sessionGenerationRef = useRef<number>(0);

  const redirectUrl =
    options?.signInRedirectUrl ??
    `/sign-in?redirect_url=${encodeURIComponent("/staff")}`;

  const performFetchSession = useCallback(
    (controller: AbortController, currentGen: number) => {
      return Promise.all([
        Promise.resolve(
          fetch("/api/auth/me", { signal: controller.signal }),
        ),
        Promise.resolve(
          fetch("/api/organizations", { signal: controller.signal }),
        ),
      ])
        .then(async ([meRes, orgsRes]) => {
          if (
            controller.signal.aborted ||
            currentGen !== sessionGenerationRef.current
          ) {
            return;
          }

          if (meRes.status === 401 || orgsRes.status === 401) {
            router.push(redirectUrl);
            return;
          }

          if (!meRes.ok) {
            throw new Error(`Failed to load profile (status ${meRes.status})`);
          }

          if (!orgsRes.ok) {
            throw new Error(
              `Failed to load organizations (status ${orgsRes.status})`,
            );
          }

          const meJson: unknown = await meRes.json();
          const orgsJson: unknown = await orgsRes.json();

          if (
            controller.signal.aborted ||
            currentGen !== sessionGenerationRef.current
          ) {
            return;
          }

          if (
            !meJson ||
            typeof meJson !== "object" ||
            !("id" in meJson) ||
            typeof (meJson as { id: unknown }).id !== "string"
          ) {
            throw new Error("Malformed profile response");
          }

          if (!Array.isArray(orgsJson)) {
            throw new Error("Malformed organizations response");
          }

          const validatedUser: CurrentUser = {
            id: (meJson as { id: string }).id,
            name:
              "name" in meJson &&
              typeof (meJson as { name: unknown }).name === "string"
                ? (meJson as { name: string }).name
                : null,
            email:
              "email" in meJson &&
              typeof (meJson as { email: unknown }).email === "string"
                ? (meJson as { email: string }).email
                : "",
          };

          const validatedOrgs: OrganizationItem[] = orgsJson.filter(
            (org): org is OrganizationItem =>
              typeof org === "object" &&
              org !== null &&
              typeof (org as { id?: unknown }).id === "string" &&
              typeof (org as { name?: unknown }).name === "string" &&
              typeof (org as { slug?: unknown }).slug === "string",
          );

          setUser(validatedUser);
          setOrganizations(validatedOrgs);

          setSelectedOrgId((currentSelected) => {
            if (
              currentSelected &&
              validatedOrgs.some((org) => org.id === currentSelected)
            ) {
              return currentSelected;
            }
            return validatedOrgs.length > 0 ? validatedOrgs[0].id : null;
          });
        })
        .catch((err: unknown) => {
          if (
            controller.signal.aborted ||
            (err instanceof DOMException && err.name === "AbortError") ||
            (err instanceof Error && err.name === "AbortError") ||
            (typeof err === "object" &&
              err !== null &&
              "name" in err &&
              (err as { name: unknown }).name === "AbortError")
          ) {
            return;
          }
          if (currentGen !== sessionGenerationRef.current) return;
          setError(
            "Unable to load your operator session at this time. Please try again.",
          );
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            currentGen === sessionGenerationRef.current
          ) {
            setIsLoading(false);
            if (sessionAbortControllerRef.current === controller) {
              sessionAbortControllerRef.current = null;
            }
          }
        });
    },
    [router, redirectUrl],
  );

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push(redirectUrl);
      return;
    }

    sessionAbortControllerRef.current?.abort();
    const controller = new AbortController();
    sessionAbortControllerRef.current = controller;
    const currentGen = ++sessionGenerationRef.current;

    performFetchSession(controller, currentGen);

    return () => {
      controller.abort();
      if (sessionAbortControllerRef.current === controller) {
        sessionAbortControllerRef.current = null;
      }
    };
  }, [isLoaded, isSignedIn, router, redirectUrl, performFetchSession]);

  // Global unmount cleanup
  useEffect(() => {
    return () => {
      sessionAbortControllerRef.current?.abort();
      sessionAbortControllerRef.current = null;
    };
  }, []);

  const retrySession = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    sessionAbortControllerRef.current?.abort();
    const controller = new AbortController();
    sessionAbortControllerRef.current = controller;
    const currentGen = ++sessionGenerationRef.current;

    await performFetchSession(controller, currentGen);
  }, [performFetchSession]);

  const selectedOrganization = useMemo(() => {
    return organizations.find((org) => org.id === selectedOrgId) ?? null;
  }, [organizations, selectedOrgId]);

  return {
    user,
    organizations,
    selectedOrgId,
    selectedOrganization,
    isLoading,
    error,
    setSelectedOrgId,
    retrySession,
  };
}
