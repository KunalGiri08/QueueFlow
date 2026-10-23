import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Organization Schedule and Closures Migration", () => {
  const migrationDir = join(
    process.cwd(),
    "prisma/migrations/20261023163000_add_organization_schedule_and_closures",
  );
  const migrationSqlPath = join(migrationDir, "migration.sql");

  it("ensures the additive migration directory and migration.sql exist", () => {
    expect(existsSync(migrationDir)).toBe(true);
    expect(existsSync(migrationSqlPath)).toBe(true);
  });

  it("adds the timezone column to Organization with default 'Asia/Kolkata'", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Organization"\s+ADD\s+COLUMN\s+"timezone"\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'Asia\/Kolkata';/i,
    );
  });

  it("creates the OrganizationScheduleInterval table with required columns", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toContain('CREATE TABLE "OrganizationScheduleInterval"');
    expect(sql).toContain('"dayOfWeek" INTEGER NOT NULL');
    expect(sql).toContain('"startTime" TEXT NOT NULL');
    expect(sql).toContain('"endTime" TEXT NOT NULL');
    expect(sql).toContain('"isActive" BOOLEAN NOT NULL DEFAULT true');
  });

  it("creates the OrganizationClosure table with required columns", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toContain('CREATE TABLE "OrganizationClosure"');
    expect(sql).toContain('"startDate" TEXT NOT NULL');
    expect(sql).toContain('"endDate" TEXT NOT NULL');
    expect(sql).toContain('"reason" TEXT');
  });

  it("defines appropriate indexes and foreign keys with CASCADE delete", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toContain(
      'CREATE INDEX "OrganizationScheduleInterval_organizationId_dayOfWeek_idx" ON "OrganizationScheduleInterval"("organizationId", "dayOfWeek")',
    );
    expect(sql).toContain(
      'CREATE INDEX "OrganizationClosure_organizationId_startDate_endDate_idx" ON "OrganizationClosure"("organizationId", "startDate", "endDate")',
    );
    expect(sql).toMatch(
      /FOREIGN\s+KEY\s*\("organizationId"\)\s*REFERENCES\s*"Organization"\("id"\)\s*ON\s+DELETE\s+CASCADE/i,
    );
  });
});
