import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("PostgreSQL partial unique index migration for active tickets", () => {
  const migrationDir = join(
    process.cwd(),
    "prisma/migrations/20261023160000_add_ticket_active_user_queue_unique_index",
  );
  const migrationSqlPath = join(migrationDir, "migration.sql");

  it("ensures the additive migration directory and migration.sql exist", () => {
    expect(existsSync(migrationDir)).toBe(true);
    expect(existsSync(migrationSqlPath)).toBe(true);
  });

  it("contains the exact PostgreSQL partial unique index specification", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");

    // 1. Verifies the exact index name requested
    expect(sql).toContain('CREATE UNIQUE INDEX "ticket_active_user_queue_idx"');

    // 2. Verifies the exact table name ("Ticket") and composite columns ("queueId", "userId")
    expect(sql).toMatch(/ON\s+"Ticket"\s*\(\s*"queueId"\s*,\s*"userId"\s*\)/i);

    // 3. Verifies the partial WHERE clause targets strictly active ticket statuses
    expect(sql).toMatch(
      /WHERE\s+"status"\s+IN\s*\(\s*'WAITING'\s*,\s*'CALLED'\s*,\s*'SERVING'\s*\)/i,
    );
  });

  it("does not include terminal statuses in the unique index predicate", () => {
    const sql = readFileSync(migrationSqlPath, "utf-8");
    expect(sql).not.toContain("COMPLETED");
    expect(sql).not.toContain("SKIPPED");
    expect(sql).not.toContain("CANCELLED");
  });
});
