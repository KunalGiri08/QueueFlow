const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  // 1. Liveness probe: returns HTTP 200 immediately without importing or querying Prisma.
  if (searchParams.get("probe") === "live") {
    return Response.json(
      { status: "ok" },
      {
        status: 200,
        headers: NO_CACHE_HEADERS,
      },
    );
  }

  // 2. Readiness probe: checks database connectivity using Prisma and SELECT 1.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const startTime = performance.now();

  try {
    const { env } = await import("@/lib/env.server");
    const timeoutMs = env.HEALTH_DB_TIMEOUT_MS ?? 8000;

    const { prisma } = await import("@/lib/prisma");

    const queryPromise = prisma.$queryRaw`SELECT 1`;

    await Promise.race([
      queryPromise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("PROBE_TIMEOUT")),
          timeoutMs,
        );
      }),
    ]);

    return Response.json(
      {
        status: "ok",
        checks: {
          database: "connected",
        },
      },
      {
        status: 200,
        headers: NO_CACHE_HEADERS,
      },
    );
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - startTime);
    const isTimeout =
      error instanceof Error && error.message === "PROBE_TIMEOUT";
    const errorCategory = isTimeout
      ? "PROBE_TIMEOUT"
      : error instanceof Error
        ? error.name || "Error"
        : "UnknownError";

    // Safe diagnostic log: stable identifier, elapsed time, and safe error category.
    // Never logs raw error messages, connection strings, secrets, or queries.
    console.error(
      `[HealthCheck] Database readiness probe failed (${elapsedMs}ms): category=${errorCategory}`,
    );

    // Return sanitized 503 response without exposing internal errors or connection details.
    return Response.json(
      {
        status: "unavailable",
        checks: {
          database: "disconnected",
        },
      },
      {
        status: 503,
        headers: NO_CACHE_HEADERS,
      },
    );
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
