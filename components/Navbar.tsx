import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";

export function Navbar() {
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
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <nav
            aria-label="Mobile navigation"
            className="flex items-center gap-4 text-xs font-medium text-gray-600 md:hidden"
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
          </nav>

          <Show when="signed-out">
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
          </Show>

          <Show when="signed-in">
            <Link
              href="/tickets"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 rounded-md px-2 py-1"
            >
              My Tickets
            </Link>
            <UserButton />
          </Show>
        </div>
      </div>
    </header>
  );
}
