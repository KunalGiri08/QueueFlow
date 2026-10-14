import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const pageParam = searchParams.get("page");
  const limitParam = searchParams.get("limit");

  let page = DEFAULT_PAGE;
  if (pageParam !== null) {
    if (!/^\d+$/.test(pageParam)) {
      return Response.json({ error: "Invalid page" }, { status: 400 });
    }
    const parsedPage = Number(pageParam);
    if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
      return Response.json({ error: "Invalid page" }, { status: 400 });
    }
    page = parsedPage;
  }

  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    if (!/^\d+$/.test(limitParam)) {
      return Response.json({ error: "Invalid limit" }, { status: 400 });
    }
    const parsedLimit = Number(limitParam);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit < MIN_LIMIT ||
      parsedLimit > MAX_LIMIT
    ) {
      return Response.json({ error: "Invalid limit" }, { status: 400 });
    }
    limit = parsedLimit;
  }

  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) {
    return Response.json({ error: "Invalid page" }, { status: 400 });
  }

  try {
    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: {
        name: "asc",
      },
      skip,
      take: limit,
    });

    return Response.json({
      organizations,
      pagination: {
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Failed to fetch public organizations:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
