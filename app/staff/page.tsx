"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { StaffOrgSelector } from "@/components/staff/StaffOrgSelector";
import { StaffCounterSelector } from "@/components/staff/StaffCounterSelector";
import { StaffActiveTicketCard } from "@/components/staff/StaffActiveTicketCard";
import { StaffAssignedQueues } from "@/components/staff/StaffAssignedQueues";
import { StaffAppointmentsManagement } from "@/components/staff/StaffAppointmentsManagement";
import { useStaffSession } from "@/hooks/useStaffSession";
import { useStaffOrgData } from "@/hooks/useStaffOrgData";
import { useTicketActions } from "@/hooks/useTicketActions";

function StaffLoadingSkeleton() {
  return (
    <div aria-label="Loading staff console" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded bg-gray-200" />
            <div className="h-4 w-64 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-44 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-36 rounded bg-gray-200 mb-4" />
        <div className="h-20 w-full rounded bg-gray-100" />
      </div>
    </div>
  );
}

function OrgDataSkeleton() {
  return (
    <div aria-label="Loading operator data" className="space-y-6 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded bg-gray-200" />
            <div className="h-4 w-60 rounded bg-gray-100" />
          </div>
          <div className="h-10 w-48 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-6 w-32 rounded bg-gray-200 mb-4" />
        <div className="h-16 w-full rounded bg-gray-100" />
      </div>
      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-gray-200 pb-4">
          <div className="h-6 w-36 rounded bg-gray-200" />
          <div className="h-9 w-24 rounded bg-gray-200" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-36 rounded-xl bg-gray-100" />
          <div className="h-36 rounded-xl bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

export default function StaffOperatorPage() {
  const {
    user,
    organizations,
    selectedOrgId,
    selectedOrganization,
    isLoading,
    error,
    setSelectedOrgId,
    retrySession,
  } = useStaffSession();

  const {
    assignedCounters,
    selectedCounterId,
    activeTicket,
    counterWarning,
    assignedQueues,
    isOrgDataLoading,
    orgDataError,
    isRefreshingQueues,
    queuesError,
    setSelectedCounterId,
    setCounterWarning,
    setActiveTicket,
    setAssignedQueues,
    retryOrgData,
    refreshQueues,
    fetchQueueStatuses,
    recoverActiveTicket,
    resetOrgData,
  } = useStaffOrgData({
    orgId: selectedOrgId,
    staffId: user?.id ?? null,
  });

  const {
    callingQueueId,
    activeTicketAction,
    isActionDisabled,
    callActionError,
    ticketActionError,
    dismissCallError,
    dismissTicketActionError,
    resetTicketActions,
    callNext,
    startService,
    completeService,
    skipTicket,
    canCallNext,
  } = useTicketActions({
    orgId: selectedOrgId,
    staffId: user?.id ?? null,
    selectedCounterId,
    assignedCounters,
    activeTicket,
    setActiveTicket,
    setAssignedQueues,
    setCounterWarning,
    setSelectedCounterId,
    fetchQueueStatuses,
    recoverActiveTicket,
  });

  const handleOrgChange = (newOrgId: string) => {
    if (newOrgId === selectedOrgId) return;
    resetOrgData();
    resetTicketActions();
    setSelectedOrgId(newOrgId);
  };

  const handleCounterChange = (counterId: string) => {
    const isTargetActive = assignedCounters.some(
      (a) => a.counter.id === counterId && a.counter.isActive,
    );
    if (isTargetActive) {
      setSelectedCounterId(counterId);
      if (activeTicket && activeTicket.counterId === counterId) {
        setCounterWarning(null);
      }
    }
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-50/50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Staff Operator Console
              </h1>
              <p className="mt-2 text-base text-gray-600 sm:text-lg">
                Manage counters, call waiting customers, and serve tickets.
              </p>
            </div>
            {user && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-gray-900">
                  {user.name || user.email}
                </span>
              </div>
            )}
          </div>

          {isLoading ? (
            <StaffLoadingSkeleton />
          ) : error ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/70 p-8 text-center text-red-800 shadow-sm"
            >
              <p className="text-base font-medium">{error}</p>
              <button
                type="button"
                onClick={retrySession}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                Retry
              </button>
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
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
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                No Organization Memberships
              </h2>
              <p className="mt-2 text-sm text-gray-600 max-w-md mx-auto">
                Your account ({user?.email || "signed-in"}) is not currently a
                member of any organization. Ask an organization administrator to
                invite you or assign you to staff.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/organizations"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
                >
                  Explore Public Organizations
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Organization Selection Bar */}
              <StaffOrgSelector
                organizations={organizations}
                selectedOrgId={selectedOrgId}
                onSelectOrg={handleOrgChange}
              />

              {/* Organization Operator Data Area */}
              {isOrgDataLoading ? (
                <OrgDataSkeleton />
              ) : orgDataError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50/70 p-6 text-center text-red-800 shadow-sm"
                >
                  <p className="text-sm font-medium">{orgDataError}</p>
                  <button
                    type="button"
                    onClick={retryOrgData}
                    className="mt-3 inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 active:scale-[0.98]"
                  >
                    Retry Loading
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Assigned Counter Selector or Empty State & Warning Banner */}
                  <StaffCounterSelector
                    assignedCounters={assignedCounters}
                    selectedCounterId={selectedCounterId}
                    onSelectCounter={handleCounterChange}
                    counterWarning={counterWarning}
                    organizationName={selectedOrganization?.name}
                  />

                  {/* Active Ticket Card, Actions & Action Error Alert */}
                  <StaffActiveTicketCard
                    activeTicket={activeTicket}
                    activeTicketAction={activeTicketAction}
                    isActionDisabled={isActionDisabled}
                    onStartService={startService}
                    onCompleteService={completeService}
                    onSkipTicket={skipTicket}
                    ticketActionError={ticketActionError}
                    onDismissError={dismissTicketActionError}
                  />

                  {/* Assigned Queues Section */}
                  <StaffAssignedQueues
                    assignedQueues={assignedQueues}
                    isRefreshingQueues={isRefreshingQueues}
                    isRefreshDisabled={isRefreshingQueues || isOrgDataLoading}
                    onRefreshQueues={refreshQueues}
                    queuesError={queuesError}
                    callActionError={callActionError}
                    onDismissCallError={dismissCallError}
                    callingQueueId={callingQueueId}
                    onCallNext={callNext}
                    canCallNext={canCallNext}
                    organizationName={selectedOrganization?.name}
                  />

                  {/* Scheduled Appointments Section */}
                  {selectedOrgId && (
                    <StaffAppointmentsManagement
                      organizationId={selectedOrgId}
                      organizationName={selectedOrganization?.name}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
