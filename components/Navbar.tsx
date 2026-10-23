"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";

export function extractUserRoles(user: unknown): {
  hasStaffRole: boolean;
  hasAdminRole: boolean;
} {
  let hasStaffRole = false;
  let hasAdminRole = false;

  if (!user || typeof user !== "object") {
    return { hasStaffRole, hasAdminRole };
  }

  const checkRole = (rawRole: unknown) => {
    if (typeof rawRole !== "string") return;
    const normalized = rawRole.toLowerCase().trim();
    if (
      normalized === "staff" ||
      normalized === "org:staff" ||
      normalized.endsWith(":staff")
    ) {
      hasStaffRole = true;
    }
    if (
      normalized === "admin" ||
      normalized === "org:admin" ||
      normalized.endsWith(":admin")
    ) {
      hasAdminRole = true;
    }
  };

  const u = user as Record<string, unknown>;

  // 1. Clerk standard: user.organizationMemberships
  if (Array.isArray(u.organizationMemberships)) {
    for (const item of u.organizationMemberships) {
      if (typeof item === "string") {
        checkRole(item);
      } else if (item && typeof item === "object") {
        const mem = item as Record<string, unknown>;
        checkRole(mem.role);
        checkRole(mem.organizationRole);
      }
    }
  }

  // 2. Generic: user.memberships
  if (Array.isArray(u.memberships)) {
    for (const item of u.memberships) {
      if (typeof item === "string") {
        checkRole(item);
      } else if (item && typeof item === "object") {
        const mem = item as Record<string, unknown>;
        checkRole(mem.role);
        checkRole(mem.organizationRole);
      }
    }
  }

  // 3. User metadata (publicMetadata, unsafeMetadata)
  for (const metaKey of ["publicMetadata", "unsafeMetadata"] as const) {
    const meta = u[metaKey];
    if (meta && typeof meta === "object") {
      const m = meta as Record<string, unknown>;
      checkRole(m.role);
      checkRole(m.organizationRole);
      if (Array.isArray(m.roles)) {
        for (const r of m.roles) checkRole(r);
      }
    }
  }

  // 4. Direct user role fields
  checkRole(u.role);
  if (Array.isArray(u.roles)) {
    for (const r of u.roles) checkRole(r);
  }

  return { hasStaffRole, hasAdminRole };
}

export function Navbar() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [fetchedUser, setFetchedUser] = useState<{
    userId: string;
    data: unknown;
  } | null>(null);

  useEffect(() => {
    if (!isSignedIn || !user?.id) {
      return;
    }

    const currentUserId = user.id;
    const controller = new AbortController();

    fetch("/api/auth/me", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setFetchedUser({ userId: currentUserId, data });
        }
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          // Gracefully fallback to Clerk user data
        }
      });

    return () => {
      controller.abort();
    };
  }, [isSignedIn, user?.id]);

  const dbUser =
    isSignedIn && user?.id && fetchedUser?.userId === user.id
      ? fetchedUser.data
      : null;
  const userRoles = extractUserRoles(user);
  const dbRoles = extractUserRoles(dbUser);
  const hasStaffRole = userRoles.hasStaffRole || dbRoles.hasStaffRole;
  const hasAdminRole = userRoles.hasAdminRole || dbRoles.hasAdminRole;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-gray-900 transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md"
            aria-label="QueueFlow Home"
          >
            <span>QueueFlow</span>
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-6 md:flex"
          >
            <Link
              href="/#features"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md"
            >
              Features
            </Link>
            <Link
              href="/#how-it-works"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md"
            >
              How It Works
            </Link>
            <Link
              href="/organizations"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md"
            >
              Explore Organizations
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <nav
            aria-label="Mobile navigation"
            className="flex items-center gap-3 sm:gap-4 text-xs font-medium text-gray-600 md:hidden"
          >
            <Link
              href="/#features"
              className="hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 rounded-md"
            >
              Features
            </Link>
            <Link
              href="/#how-it-works"
              className="hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 rounded-md"
            >
              How It Works
            </Link>
            <Link
              href="/organizations"
              className="hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 rounded-md"
            >
              Explore Organizations
            </Link>
          </nav>

          {!isLoaded ? (
            <div
              role="status"
              aria-label="Loading authentication"
              className="flex items-center gap-2 animate-pulse"
            >
              <div className="h-8 w-20 rounded-lg bg-gray-200" />
            </div>
          ) : !isSignedIn ? (
            <div className="flex items-center gap-3">
              <Link
                href="/sign-in"
                className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md px-2 py-1"
              >
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Get Started
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/tickets"
                className="text-xs sm:text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md px-1.5 py-1 sm:px-2"
              >
                My Tickets
              </Link>
              <Link
                href="/appointments"
                className="text-xs sm:text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md px-1.5 py-1 sm:px-2"
              >
                My Appointments
              </Link>
              {(hasStaffRole || hasAdminRole) && (
                <Link
                  href="/staff"
                  className="text-xs sm:text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md px-1.5 py-1 sm:px-2"
                >
                  Staff Console
                </Link>
              )}
              {hasAdminRole && (
                <Link
                  href="/admin"
                  className="text-xs sm:text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md px-1.5 py-1 sm:px-2"
                >
                  Admin Dashboard
                </Link>
              )}
              <UserButton />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
