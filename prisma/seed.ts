import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("Starting database seed...");

  const organization = await prisma.organization.upsert({
    where: {
      slug: "queueflow-demo-bank",
    },
    update: {},
    create: {
      name: "QueueFlow Demo Bank",
      slug: "queueflow-demo-bank",
    },
  });

  const customer = await prisma.user.upsert({
    where: {
      email: "kunal@example.com",
    },
    update: {},
    create: {
      name: "Kunal",
      email: "kunal@example.com",
    },
  });

  const staff = await prisma.user.upsert({
    where: {
      email: "rahul@queueflow.com",
    },
    update: {},
    create: {
      name: "Rahul",
      email: "rahul@queueflow.com",
    },
  });

  await prisma.organizationMembership.upsert({
    where: {
      userId_organizationId: {
        userId: staff.id,
        organizationId: organization.id,
      },
    },
    update: {},
    create: {
      userId: staff.id,
      organizationId: organization.id,
      role: "STAFF",
    },
  });

  const service = await prisma.service.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Cash Deposit",
      },
    },
    update: {},
    create: {
      name: "Cash Deposit",
      organizationId: organization.id,
      description: "Cash deposit service",
    },
  });

  const queue = await prisma.queue.upsert({
    where: {
      serviceId_name: {
        serviceId: service.id,
        name: "General Queue",
      },
    },
    update: {},
    create: {
      name: "General Queue",
      serviceId: service.id,
    },
  });

  const counter = await prisma.counter.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "Counter 1",
      },
    },
    update: {},
    create: {
      name: "Counter 1",
      organizationId: organization.id,
    },
  });

  await prisma.staffCounterAssignment.upsert({
    where: {
      userId_counterId: {
        userId: staff.id,
        counterId: counter.id,
      },
    },
    update: {},
    create: {
      userId: staff.id,
      counterId: counter.id,
    },
  });

  await prisma.ticket.upsert({
    where: {
      queueId_number: {
        queueId: queue.id,
        number: 1,
      },
    },
    update: {},
    create: {
      number: 1,
      queueId: queue.id,
      userId: customer.id,
    },
  });

  const highestTicket = await prisma.ticket.aggregate({
    where: {
      queueId: queue.id,
    },
    _max: {
      number: true,
    },
  });

  await prisma.queue.update({
    where: {
      id: queue.id,
    },
    data: {
      nextTicketNumber: (highestTicket._max.number ?? 0) + 1,
    },
  });

  console.log("Database seed completed successfully.");
}

main()
  .catch((error) => {
    console.error("Database seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });