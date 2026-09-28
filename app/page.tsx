export default function Home() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <nav className="flex items-center justify-between border-b px-8 py-5">
        <h1 className="text-2xl font-bold">QueueFlow</h1>

        <div className="flex gap-6">
          <a href="#features">Features</a>
          <a href="#how-it-works">How It Works</a>
          <button className="rounded-lg bg-black px-5 py-2 text-white">
            Get Started
          </button>
        </div>
      </nav>

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
    </main>
  );
}
