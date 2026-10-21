import Link from "next/link";

/**
 * Presentational empty state when a customer has no appointments.
 * Directs users to explore organizations and services.
 */
export function AppointmentsEmptyState() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-500">
        <svg
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-gray-900">
        No appointments yet
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        You don&apos;t have any scheduled or past appointments. Explore
        organizations to find available services and book a time that works for
        you.
      </p>
      <div className="mt-6">
        <Link
          href="/organizations"
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
        >
          Explore Organizations
        </Link>
      </div>
    </div>
  );
}
