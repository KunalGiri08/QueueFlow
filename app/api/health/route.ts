const DB_TIMEOUT_MS = 2000;

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

  try {
    const { prisma } = await import("@/lib/prisma");

    const queryPromise =
      typeof prisma.$transaction === "function"
        ? prisma.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT 1`;
            },
            {
              maxWait: DB_TIMEOUT_MS,
              timeout: DB_TIMEOUT_MS,
            },
          )
        : prisma.$queryRaw`SELECT 1`;

    await Promise.race([
      queryPromise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("PROBE_TIMEOUT")),
          DB_TIMEOUT_MS + 250,
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
  } catch {
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
