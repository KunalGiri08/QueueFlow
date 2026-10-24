import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Queue Capacity Limits Migration", () => {
  const migrationDir = join(
    process.cwd(),
    "prisma/migrations/20261024160000_add_queue_capacity_limits",
  );
  const migrationSqlPath = join(migrationDir, "migration.sql");

  it("ensures the additive migration directory and migration.sql exist", () => {
    expect(existsSync(migrationDir)).toBe(true);
    expect(existsSync(migrationSqlPath)).toBe(true);
  });

  it("adds the nullable maxWaitingTickets and maxDailyTickets columns to Queue", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Queue"\s+ADD\s+COLUMN\s+"maxWaitingTickets"\s+INTEGER;/i,
    );
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Queue"\s+ADD\s+COLUMN\s+"maxDailyTickets"\s+INTEGER;/i,
    );
  });

  it("creates index on Ticket (queueId, createdAt)", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+"Ticket_queueId_createdAt_idx"\s+ON\s+"Ticket"\s*\(\s*"queueId"\s*,\s*"createdAt"\s*\);/i,
    );
  });
});
