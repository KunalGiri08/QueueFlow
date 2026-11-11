import { prisma } from "@/lib/prisma";
import { isValidCalendarDateString } from "@/lib/validations/schedule";
import { calculateAvailableSlots } from "@/lib/services/appointment.service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      serviceId: string;
    }>;
  },
) {
  const { organizationId, serviceId } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (!date || !isValidCalendarDateString(date)) {
    return Response.json(
      {
        error: "A valid date parameter (YYYY-MM-DD) is required",
        code: "INVALID_DATE",
      },
      { status: 400 },
    );
  }

  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      organizationId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      durationMinutes: true,
      bufferMinutes: true,
      minNoticeHours: true,
      maxAdvanceDays: true,
      slotCapacity: true,
      organization: {
        select: {
          id: true,
          timezone: true,
          scheduleIntervals: {
            where: { isActive: true },
            select: {
              id: true,
              dayOfWeek: true,
              startTime: true,
              endTime: true,
              isActive: true,
            },
          },
          closures: {
            select: {
              id: true,
              startDate: true,
              endDate: true,
              reason: true,
            },
          },
        },
      },
    },
  });

  if (!service) {
    return Response.json(
      { error: "Service not found or inactive" },
      { status: 404 },
    );
  }

  const [y, m, d] = date.split("-").map(Number);
  const approxStart = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
  const approxEnd = new Date(Date.UTC(y, m - 1, d + 2, 0, 0, 0));

  const activeAppointments = await prisma.appointment.findMany({
    where: {
      serviceId,
      status: { not: "CANCELLED" },
      scheduledAt: {
        gte: approxStart,
        lte: approxEnd,
      },
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMinutes: true,
      status: true,
    },
  });

  const slots = calculateAvailableSlots({
    service,
    timezone: service.organization.timezone,
    scheduleIntervals: service.organization.scheduleIntervals,
    closures: service.organization.closures,
    targetDate: date,
    activeAppointments,
  });

  return Response.json({
    date,
    service: {
      id: service.id,
      name: service.name,
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes,
      slotCapacity: service.slotCapacity,
    },
    slots,
  });
}

