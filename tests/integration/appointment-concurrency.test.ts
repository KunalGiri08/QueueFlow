import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@/app/generated/prisma/client";
import { assertSafeTestDatabaseUrl } from "@/scripts/db-safety";
import {
  createTestPrismaClient,
  prisma,
  runWithPrismaClient,
} from "@/tests/helpers/test-prisma";

// Mock external authentication/session dependency so we can execute as arbitrary test users
const userStorage = new AsyncLocalStorage<{
  id: string;
  email: string;
  name?: string | null;
  clerkId?: string | null;
}>();

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => {
    return userStorage.getStore() ?? null;
  }),
}));

// Import the real production route handlers.
// The @/lib/prisma import is aliased by vitest.integration.config.ts to test-prisma.
import { POST } from "@/app/api/appointments/route";
import { PATCH } from "@/app/api/appointments/[id]/route";

function makeCreateAppointmentRequest(serviceId: string, scheduledAt: string): Request {
  return new Request("http://localhost:3000/api/appointments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ serviceId, scheduledAt }),
  });
}

function makeRescheduleAppointmentRequest(scheduledAt: string): Request {
  return new Request("http://localhost:3000/api/appointments/target", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ scheduledAt }),
  });
}

function executeCreateAppointment(
  user: { id: string; email: string; name?: string | null; clerkId?: string | null },
  client: PrismaClient,
  req: Request,
): Promise<Response> {
  return userStorage.run(user, () => runWithPrismaClient(client, () => POST(req)));
}

function executeRescheduleAppointment(
  user: { id: string; email: string; name?: string | null; clerkId?: string | null },
  client: PrismaClient,
  appointmentId: string,
  req: Request,
): Promise<Response> {
  return userStorage.run(user, () =>
    runWithPrismaClient(client, () =>
      PATCH(req, { params: Promise.resolve({ id: appointmentId }) }),
    ),
  );
}

describe("QueueFlow Appointment Concurrency Integration Tests (Real PostgreSQL)", () => {
  const createdOrgIds: string[] = [];
  const createdUserIds: string[] = [];
  const activeClients: PrismaClient[] = [];

  function getIndependentClient(): PrismaClient {
    const client = createTestPrismaClient();
    activeClients.push(client);
    return client;
  }

  beforeEach(() => {
    // Assert target safety before every test
    assertSafeTestDatabaseUrl();
  });

  afterEach(async () => {
    // 1. Clean up fixtures created during the test
    if (createdOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: createdOrgIds } },
      });
      createdOrgIds.length = 0;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
      createdUserIds.length = 0;
    }

    // 2. Disconnect test clients used for concurrent connections
    for (const client of activeClients) {
      try {
        await client.$disconnect();
      } catch {
        // ignore disconnect errors
      }
    }
    activeClients.length = 0;
  });

  async function createTestOrgAndServices(options?: {
    service1Duration?: number;
    service2Duration?: number;
    slotCapacity?: number;
  }) {
    const testId = randomUUID().slice(0, 8);
    const org = await prisma.organization.create({
      data: {
        name: `Test Org ${testId}`,
        slug: `test-org-${testId}`,
        timezone: "UTC",
        scheduleIntervals: {
          create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
            dayOfWeek,
            startTime: "00:00",
            endTime: "23:59",
            isActive: true,
          })),
        },
      },
    });
    createdOrgIds.push(org.id);

    const service1 = await prisma.service.create({
      data: {
        name: `Consultation Service 1 ${testId}`,
        organizationId: org.id,
        isActive: true,
        durationMinutes: options?.service1Duration ?? 30,
        bufferMinutes: 0,
        slotCapacity: options?.slotCapacity ?? 1,
      },
    });

    const service2 = await prisma.service.create({
      data: {
        name: `Advisory Service 2 ${testId}`,
        organizationId: org.id,
        isActive: true,
        durationMinutes: options?.service2Duration ?? 30,
        bufferMinutes: 0,
        slotCapacity: options?.slotCapacity ?? 1,
      },
    });

    return { org, service1, service2, testId };
  }

  async function createTestUser(prefix = "user") {
    const userId = randomUUID();
    const user = await prisma.user.create({
      data: {
        id: userId,
        clerkId: `clerk_${userId}`,
        email: `${prefix}_${userId.slice(0, 8)}@test.local`,
        name: `Test ${prefix} ${userId.slice(0, 6)}`,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  function getFutureUtcSlot(hoursAhead = 24): { slotIso: string; slotDate: Date } {
    const date = new Date(Date.now() + hoursAhead * 3600 * 1000);
    date.setUTCMinutes(0, 0, 0);
    return { slotIso: date.toISOString(), slotDate: date };
  }

  it("Scenario 1: Cross-Service Customer Concurrency - serializes overlapping bookings for same user across services and admits exactly one", async () => {
    const { service1, service2 } = await createTestOrgAndServices({
      service1Duration: 30,
      service2Duration: 30,
    });
    const customer = await createTestUser();

    const { slotDate } = getFutureUtcSlot(24);
    const slot1Iso = slotDate.toISOString(); // e.g. 10:00 - 10:30
    const slot2Date = new Date(slotDate.getTime() + 15 * 60 * 1000); // 10:15 - 10:45 (overlaps slot1)
    const slot2Iso = slot2Date.toISOString();

    const clientA = getIndependentClient();
    const clientB = getIndependentClient();

    const req1 = makeCreateAppointmentRequest(service1.id, slot1Iso);
    const req2 = makeCreateAppointmentRequest(service2.id, slot2Iso);

    // Concurrently submit two booking requests for overlapping times on DIFFERENT services
    const [res1, res2] = await Promise.all([
      executeCreateAppointment(customer, clientA, req1),
      executeCreateAppointment(customer, clientB, req2),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const failedResponse = res1.status === 409 ? res1 : res2;
    const errorBody = await failedResponse.json();
    expect(errorBody.code).toBe("CUSTOMER_SCHEDULE_CONFLICT");

    // Verify database integrity: exactly 1 active appointment exists for customer
    const activeAppointments = await prisma.appointment.findMany({
      where: {
        userId: customer.id,
        status: { not: "CANCELLED" },
      },
    });
    expect(activeAppointments).toHaveLength(1);
  });

  it("Scenario 2: Independent Customers Concurrency - different users book overlapping slots without blocking each other", async () => {
    const { service1, service2 } = await createTestOrgAndServices({
      service1Duration: 30,
      service2Duration: 30,
    });
    const customer1 = await createTestUser();
    const customer2 = await createTestUser();

    const { slotDate } = getFutureUtcSlot(48);
    const slot1Iso = slotDate.toISOString();
    const slot2Date = new Date(slotDate.getTime() + 15 * 60 * 1000);
    const slot2Iso = slot2Date.toISOString();

    const clientA = getIndependentClient();
    const clientB = getIndependentClient();

    const req1 = makeCreateAppointmentRequest(service1.id, slot1Iso);
    const req2 = makeCreateAppointmentRequest(service2.id, slot2Iso);

    const [res1, res2] = await Promise.all([
      executeCreateAppointment(customer1, clientA, req1),
      executeCreateAppointment(customer2, clientB, req2),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);

    const activeCount = await prisma.appointment.count({
      where: {
        userId: { in: [customer1.id, customer2.id] },
        status: { not: "CANCELLED" },
      },
    });
    expect(activeCount).toBe(2);
  });

  it("Scenario 3: Same-Service Capacity Concurrency - enforces slot capacity under concurrent bookings by different customers", async () => {
    const { service1 } = await createTestOrgAndServices({
      service1Duration: 30,
      slotCapacity: 1,
    });
    const customer1 = await createTestUser();
    const customer2 = await createTestUser();

    const { slotIso } = getFutureUtcSlot(72);

    const clientA = getIndependentClient();
    const clientB = getIndependentClient();

    const req1 = makeCreateAppointmentRequest(service1.id, slotIso);
    const req2 = makeCreateAppointmentRequest(service1.id, slotIso);

    const [res1, res2] = await Promise.all([
      executeCreateAppointment(customer1, clientA, req1),
      executeCreateAppointment(customer2, clientB, req2),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const activeAppointments = await prisma.appointment.findMany({
      where: {
        serviceId: service1.id,
        scheduledAt: new Date(slotIso),
        status: { not: "CANCELLED" },
      },
    });
    expect(activeAppointments).toHaveLength(1);
  });

  it("Scenario 4: Reschedule Conflict Invariant - prevents rescheduling into a cross-service overlap with existing appointment", async () => {
    const { service1, service2 } = await createTestOrgAndServices({
      service1Duration: 30,
      service2Duration: 30,
    });
    const customer = await createTestUser();

    const { slotDate } = getFutureUtcSlot(96);
    const slot1Date = slotDate; // 10:00 - 10:30 on Service 1
    const slot2InitialDate = new Date(slotDate.getTime() + 120 * 60 * 1000); // 12:00 - 12:30 on Service 2

    // Pre-create Appointment 1 on Service 1
    await prisma.appointment.create({
      data: {
        serviceId: service1.id,
        userId: customer.id,
        scheduledAt: slot1Date,
        durationMinutes: 30,
        status: "BOOKED",
      },
    });

    // Pre-create Appointment 2 on Service 2
    const appt2 = await prisma.appointment.create({
      data: {
        serviceId: service2.id,
        userId: customer.id,
        scheduledAt: slot2InitialDate,
        durationMinutes: 30,
        status: "BOOKED",
      },
    });

    const client = getIndependentClient();
    // Reschedule Appointment 2 to 10:15 (which overlaps Appointment 1)
    const overlappingSlotIso = new Date(slot1Date.getTime() + 15 * 60 * 1000).toISOString();
    const req = makeRescheduleAppointmentRequest(overlappingSlotIso);

    const res = await executeRescheduleAppointment(customer, client, appt2.id, req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("CUSTOMER_SCHEDULE_CONFLICT");

    // Verify Appointment 2 was not modified in the database
    const appt2InDb = await prisma.appointment.findUniqueOrThrow({
      where: { id: appt2.id },
    });
    expect(appt2InDb.scheduledAt.getTime()).toBe(slot2InitialDate.getTime());
  });

  it("Scenario 5: Concurrent Booking vs Reschedule - serializes booking and rescheduling for same customer", async () => {
    const { service1, service2 } = await createTestOrgAndServices({
      service1Duration: 30,
      service2Duration: 30,
    });
    const customer = await createTestUser();

    const { slotDate } = getFutureUtcSlot(120);
    const slotTargetDate = slotDate; // 10:00 - 10:30
    const slotTargetOverlapping = new Date(slotDate.getTime() + 15 * 60 * 1000); // 10:15 - 10:45
    const slotInitialFar = new Date(slotDate.getTime() + 240 * 60 * 1000); // 14:00

    // Pre-create existing Appointment A on Service 1 far in the future
    const apptA = await prisma.appointment.create({
      data: {
        serviceId: service1.id,
        userId: customer.id,
        scheduledAt: slotInitialFar,
        durationMinutes: 30,
        status: "BOOKED",
      },
    });

    const client1 = getIndependentClient();
    const client2 = getIndependentClient();

    // Simultaneously:
    // 1. Customer books Service 2 at slotTargetDate (10:00)
    // 2. Customer reschedules Appointment A to slotTargetOverlapping (10:15)
    const reqBooking = makeCreateAppointmentRequest(service2.id, slotTargetDate.toISOString());
    const reqReschedule = makeRescheduleAppointmentRequest(slotTargetOverlapping.toISOString());

    const [resBooking, resReschedule] = await Promise.all([
      executeCreateAppointment(customer, client1, reqBooking),
      executeRescheduleAppointment(customer, client2, apptA.id, reqReschedule),
    ]);

    const statuses = [resBooking.status, resReschedule.status].sort();
    // One succeeds (200 for reschedule or 201 for booking), and one receives 409
    expect(statuses).toEqual([200, 409].sort());

    const failedRes = resBooking.status === 409 ? resBooking : resReschedule;
    const body = await failedRes.json();
    expect(body.code).toBe("CUSTOMER_SCHEDULE_CONFLICT");
  });
});

