"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { OrganizationItem } from "./OrganizationSelector";

export interface CreateOrganizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newOrg: OrganizationItem) => void;
}

/**
 * Helper to auto-generate a URL-friendly slug from an organization name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export function CreateOrganizationDialog({
  isOpen,
  onClose,
  onSuccess,
}: CreateOrganizationDialogProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string }>({});

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Synchronously reset form state during render when dialog opens
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setName("");
      setSlug("");
      setIsSlugManuallyEdited(false);
      setIsSubmitting(false);
      setErrorMessage(null);
      setFieldErrors({});
    }
  }

  // Focus name input when dialog opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) {
    return null;
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    if (fieldErrors.name) {
      setFieldErrors((prev) => ({ ...prev, name: undefined }));
    }
    if (errorMessage) {
      setErrorMessage(null);
    }

    if (!isSlugManuallyEdited) {
      setSlug(generateSlug(newName));
      if (fieldErrors.slug) {
        setFieldErrors((prev) => ({ ...prev, slug: undefined }));
      }
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugManuallyEdited(true);
    const newSlug = e.target.value.toLowerCase().replace(/\s+/g, "-");
    setSlug(newSlug);
    if (fieldErrors.slug) {
      setFieldErrors((prev) => ({ ...prev, slug: undefined }));
    }
    if (errorMessage) {
      setErrorMessage(null);
    }
  };

  const validate = (): boolean => {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    const errors: { name?: string; slug?: string } = {};

    if (!trimmedName) {
      errors.name = "Organization name is required.";
    } else if (trimmedName.length > 100) {
      errors.name = "Organization name must be 100 characters or fewer.";
    }

    if (!trimmedSlug) {
      errors.slug = "Organization slug is required.";
    } else if (trimmedSlug.length > 50) {
      errors.slug = "Organization slug must be 50 characters or fewer.";
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmedSlug)) {
      errors.slug =
        "Slug must contain only lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();

    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          slug: trimmedSlug,
        }),
      });

      if (response.status === 401) {
        router.push(`/sign-in?redirect_url=${encodeURIComponent("/admin")}`);
        return;
      }

      if (response.status === 409) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorMessage(
          errorData.error ||
            "An organization with this slug already exists. Please choose a different slug.",
        );
        return;
      }

      if (response.status === 400) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: string;
          details?: { fieldErrors?: Record<string, string[]> };
        };
        setErrorMessage(
          errorData.error ||
            "Invalid organization details provided. Please review the form.",
        );
        return;
      }

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const createdOrg = (await response.json()) as {
        id: string;
        name: string;
        slug: string;
      };

      if (
        createdOrg &&
        typeof createdOrg.id === "string" &&
        typeof createdOrg.name === "string" &&
        typeof createdOrg.slug === "string"
      ) {
        onSuccess({
          id: createdOrg.id,
          name: createdOrg.name,
          slug: createdOrg.slug,
        });
        onClose();
      } else {
        throw new Error("Malformed created organization response");
      }
    } catch {
      setErrorMessage(
        "Failed to create organization due to a network error. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-org-dialog-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white p-6 shadow-xl transition-all space-y-4"
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div>
            <h3
              id="create-org-dialog-title"
              className="text-lg font-bold text-gray-900"
            >
              Create Organization
            </h3>
            <p className="mt-0.5 text-xs text-gray-500">
              Set up a new organization to manage services, queues, and appointments.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="create-org-name"
              className="block text-sm font-semibold text-gray-900"
            >
              Organization Name <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-xs text-gray-500">
              The public name displayed to staff and customers.
            </p>
            <input
              ref={nameInputRef}
              id="create-org-name"
              type="text"
              required
              value={name}
              onChange={handleNameChange}
              disabled={isSubmitting}
              placeholder="e.g., Apex Healthcare"
              maxLength={100}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={
                fieldErrors.name ? "create-org-name-error" : undefined
              }
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
            />
            {fieldErrors.name && (
              <p
                id="create-org-name-error"
                className="mt-1 text-xs font-medium text-red-600"
              >
                {fieldErrors.name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="create-org-slug"
              className="block text-sm font-semibold text-gray-900"
            >
              Organization URL Slug <span className="text-red-500">*</span>
            </label>
            <p className="mt-0.5 text-xs text-gray-500">
              Lowercase letters, numbers, and hyphens only. Used in public queue and booking links.
            </p>
            <div className="mt-1.5 flex rounded-lg shadow-sm">
              <span className="inline-flex items-center rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-xs text-gray-500 select-none">
                @
              </span>
              <input
                id="create-org-slug"
                type="text"
                required
                value={slug}
                onChange={handleSlugChange}
                disabled={isSubmitting}
                placeholder="apex-healthcare"
                maxLength={50}
                aria-invalid={Boolean(fieldErrors.slug)}
                aria-describedby={
                  fieldErrors.slug ? "create-org-slug-error" : undefined
                }
                className="w-full rounded-none rounded-r-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 shadow-sm transition-colors focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-50"
              />
            </div>
            {fieldErrors.slug && (
              <p
                id="create-org-slug-error"
                className="mt-1 text-xs font-medium text-red-600"
              >
                {fieldErrors.slug}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
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
                "Create Organization"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

