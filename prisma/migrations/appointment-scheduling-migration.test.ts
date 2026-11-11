import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Appointment Scheduling Engine Migration", () => {
  const migrationDir = join(
    process.cwd(),
    "prisma/migrations/20261111210000_add_appointment_scheduling_engine",
  );
  const migrationSqlPath = join(migrationDir, "migration.sql");

  it("ensures the additive migration directory and migration.sql exist", () => {
    expect(existsSync(migrationDir)).toBe(true);
    expect(existsSync(migrationSqlPath)).toBe(true);
  });

  it("adds the scheduling configuration columns to Service with defaults", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"durationMinutes"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+30;/i,
    );
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"bufferMinutes"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+0;/i,
    );
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"minNoticeHours"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+2;/i,
    );
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"maxAdvanceDays"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+30;/i,
    );
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"slotCapacity"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+1;/i,
    );
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"cancellationNoticeHours"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+2;/i,
    );
  });

  it("adds durationMinutes snapshot column to Appointment with default 30", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Appointment"\s+ADD\s+COLUMN\s+"durationMinutes"\s+INTEGER\s+NOT\s+NULL\s+DEFAULT\s+30;/i,
    );
  });

  it("drops the partial unique active key and creates active non-unique indexes", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+"Appointment_serviceId_scheduledAt_active_key";/i,
    );
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+"Appointment_serviceId_scheduledAt_active_idx"\s+ON\s+"Appointment"\s*\(\s*"serviceId"\s*,\s*"scheduledAt"\s*\)\s*WHERE\s+"status"\s*<>\s*'CANCELLED';/i,
    );
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+"Appointment_userId_scheduledAt_active_idx"\s+ON\s+"Appointment"\s*\(\s*"userId"\s*,\s*"scheduledAt"\s*\)\s*WHERE\s+"status"\s*<>\s*'CANCELLED';/i,
    );
  });
});

