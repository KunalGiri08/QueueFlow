import { Navbar } from "@/components/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white text-gray-900">
        <section className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
          <h2 className="max-w-3xl text-5xl font-bold tracking-tight">
            No More Waiting in Physical Queues
          </h2>

          <p className="mt-6 max-w-2xl text-lg text-gray-600">
            QueueFlow helps organizations manage virtual queues and appointments
            while customers track their position in real time.
          </p>

          <button className="mt-8 rounded-lg bg-black px-6 py-3 text-white">
            Join Queue
          </button>
        </section>

        <section
          id="features"
          className="border-t border-gray-100 bg-gray-50/50 px-6 py-24 sm:px-8 lg:px-12 scroll-mt-16"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                Streamlined Queue Management
              </h2>
              <p className="mt-4 text-base text-gray-600 sm:text-lg">
                QueueFlow gives organizations and customers the modern tools they need for a seamless service experience.
              </p>
            </div>

            <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-900">
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
                      d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
                    />
                  </svg>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
                  Virtual Queues & Live Position
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  Allow customers to join virtual queues remotely and monitor their live ticket position, estimated wait time, and queue status in real time.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-900">
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
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
                  Appointment Booking & Scheduling
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  Enable visitors to book specific time slots in advance, balancing scheduled appointments with on-demand walk-in queues effortlessly.
                </p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-900">
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
                      d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
                    />
                  </svg>
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
                  Staff & Admin Dashboards
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  Equip service counters and organization administrators with powerful controls to call tickets, manage service counters, and view activity.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-t border-gray-100 bg-white px-6 py-24 sm:px-8 lg:px-12 scroll-mt-16"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                How It Works
              </h2>
              <p className="mt-4 text-base text-gray-600 sm:text-lg">
                Experience a straightforward customer journey designed to replace physical waiting with virtual flexibility.
              </p>
            </div>

            <ol className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3 list-none">
              <li className="relative rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
                  1
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
                  Choose an Organization and Service
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  Select the participating organization, branch location, and the specific service counter you need to visit.
                </p>
              </li>

              <li className="relative rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
                  2
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
                  Join a Virtual Queue or Book an Appointment
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  Issue a digital ticket to join the live virtual queue on demand, or schedule a dedicated appointment for a future time slot.
                </p>
              </li>

              <li className="relative rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-sm font-bold text-white">
                  3
                </div>
                <h3 className="mt-6 text-xl font-semibold tracking-tight text-gray-900">
                  Track Ticket Status and Queue Position
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">
                  Keep track of your real-time position in line and estimated wait times, receiving prompt updates when your ticket is ready to be called.
                </p>
              </li>
            </ol>
          </div>
        </section>
      </main>
    </>
  );
}
