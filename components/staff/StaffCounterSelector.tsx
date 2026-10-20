import type { ReactElement } from "react";

export interface CounterData {
  id: string;
  name: string;
  isActive: boolean;
  organizationId: string;
}

export interface AssignedCounterItem {
  id: string;
  staffId: string;
  counter: CounterData;
}

export interface StaffCounterSelectorProps {
  assignedCounters: AssignedCounterItem[];
  selectedCounterId: string | null;
  onSelectCounter: (counterId: string) => void;
  counterWarning: string | null;
  organizationName?: string | null;
}

export function StaffCounterSelector({
  assignedCounters,
  selectedCounterId,
  onSelectCounter,
  counterWarning,
  organizationName,
}: StaffCounterSelectorProps): ReactElement {
  const activeAssignedCounters = assignedCounters.filter(
    (a) => a.counter.isActive,
  );
  const inactiveAssignedCounters = assignedCounters.filter(
    (a) => !a.counter.isActive,
  );

  return (
    <>
      {/* Assigned Counter Selector or Empty State */}
      {assignedCounters.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                No Counters Assigned
              </h4>
              <p className="mt-1 text-sm text-amber-800">
                You are not currently assigned to any counters in{" "}
                <span className="font-semibold">
                  {organizationName}
                </span>
                . An organization administrator must assign you to an
                active desk before you can call or serve tickets.
              </p>
            </div>
          </div>
        </div>
      ) : activeAssignedCounters.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-amber-900 shadow-sm">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <div>
              <h4 className="text-sm font-semibold text-amber-900">
                All Assigned Counters Inactive
              </h4>
              <p className="mt-1 text-sm text-amber-800">
                All counters assigned to your account in this
                organization are currently inactive. An administrator
                must reactivate a desk before tickets can be served.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <label
                htmlFor="counter-select"
                className="text-lg font-semibold text-gray-900"
              >
                Assigned Desk / Counter
              </label>
              <p className="mt-1 text-sm text-gray-500">
                Select the active counter from which you will call
                and serve customers.
              </p>
            </div>
            <div className="min-w-[240px]">
              <select
                id="counter-select"
                value={selectedCounterId ?? ""}
                onChange={(e) => onSelectCounter(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              >
                {activeAssignedCounters.map((item) => (
                  <option
                    key={item.counter.id}
                    value={item.counter.id}
                  >
                    {item.counter.name} (Active)
                  </option>
                ))}
                {inactiveAssignedCounters.map((item) => (
                  <option
                    key={item.counter.id}
                    value={item.counter.id}
                    disabled
                  >
                    {item.counter.name} (Inactive)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Counter Inactivity or Mismatch Warning Banner */}
      {counterWarning && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 text-amber-600 mt-0.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
            <div>
              <p className="text-sm font-semibold">{counterWarning}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
