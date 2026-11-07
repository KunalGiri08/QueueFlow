export interface ScheduleIntervalClient {
  organizationScheduleInterval: {
    count: (args: { where: { organizationId: string } }) => Promise<number>;
    create: (args: {
      data: {
        id: string;
        organizationId: string;
        dayOfWeek: number;
        startTime: string;
        endTime: string;
        isActive: boolean;
      };
    }) => Promise<unknown>;
  };
}

/**
 * Seeds demo default operating hours only when the organization has no schedule intervals configured.
 * Guarantees that administrator-configured operating hours are NEVER overwritten or altered on seed runs.
 *
 * @param db - Prisma client or minimal database client interface
 * @param organizationId - ID of the target organization
 * @returns Result object indicating whether intervals were seeded and how many were created
 */
export async function seedDemoOperatingHours(
  db: ScheduleIntervalClient,
  organizationId: string,
): Promise<{ seeded: boolean; count: number }> {
  const existingIntervalCount = await db.organizationScheduleInterval.count({
    where: {
      organizationId,
    },
  });

  if (existingIntervalCount === 0) {
    for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
      await db.organizationScheduleInterval.create({
        data: {
          id: `seed-interval-${organizationId}-${dayOfWeek}`,
          organizationId,
          dayOfWeek,
          startTime: "00:00",
          endTime: "23:59",
          isActive: true,
        },
      });
    }
    return { seeded: true, count: 7 };
  }

  return { seeded: false, count: 0 };
}

