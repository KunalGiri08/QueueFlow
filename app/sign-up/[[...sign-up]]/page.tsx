import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md flex justify-center">
          <SignUp />
        </div>
        <div className="mt-4 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 rounded-md px-2 py-1 inline-flex items-center gap-1.5"
          >
            <span aria-hidden="true">&larr;</span> Back to QueueFlow
          </Link>
        </div>
      </main>
    </div>
  );
}
