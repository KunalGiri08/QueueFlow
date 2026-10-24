import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Service Admission Cutoff Migration", () => {
  const migrationDir = join(
    process.cwd(),
    "prisma/migrations/20261023180000_add_service_admission_cutoff_minutes",
  );
  const migrationSqlPath = join(migrationDir, "migration.sql");

  it("ensures the additive migration directory and migration.sql exist", () => {
    expect(existsSync(migrationDir)).toBe(true);
    expect(existsSync(migrationSqlPath)).toBe(true);
  });

  it("adds the nullable admissionCutoffMinutes column to Service", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).toMatch(
      /ALTER\s+TABLE\s+"Service"\s+ADD\s+COLUMN\s+"admissionCutoffMinutes"\s+INTEGER;/i,
    );
  });
});
