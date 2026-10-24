import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { assertSafeTestDatabaseUrl, sanitizeErrorMessage } from "./db-safety";

export async function setupTestDatabase(): Promise<void> {
  const rawUrl =
    process.env.TEST_DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5433/queueflow_test";

  // 1. Strictly assert safety: refuses remote, Neon, or non-queueflow_test databases
  const safety = assertSafeTestDatabaseUrl(rawUrl);
  console.log(`[setup-test-db] Target verified: ${safety.sanitizedUrl}`);

  const client = new Client({ connectionString: rawUrl });

  try {
    await client.connect();

    // 2. Double-check database identity directly via SQL
    const idRes = await client.query<{ db: string; usr: string }>(
      "SELECT current_database() as db, current_user as usr",
    );
    const actualDb = idRes.rows[0]?.db;
    if (actualDb !== "queueflow_test") {
      throw new Error(
        `Safety guard: Connected database is '${actualDb}', expected 'queueflow_test'. Aborting.`,
      );
    }

    console.log(
      `[setup-test-db] Connected to PostgreSQL. Active database: ${actualDb}`,
    );

    // 3. Find and sort all migrations in prisma/migrations
    const migrationsDir = path.join(process.cwd(), "prisma", "migrations");
    const migrationDirs = fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    console.log(
      `[setup-test-db] Found ${migrationDirs.length} migrations to verify/apply.`,
    );

    // Create a simple migrations tracking table if not present
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_queueflow_test_migrations" (
        "id" SERIAL PRIMARY KEY,
        "migration_name" TEXT UNIQUE NOT NULL,
        "applied_at" TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    const appliedRes = await client.query<{ migration_name: string }>(
      "SELECT migration_name FROM _queueflow_test_migrations",
    );
    const appliedSet = new Set(appliedRes.rows.map((r) => r.migration_name));

    for (const dirName of migrationDirs) {
      const sqlPath = path.join(migrationsDir, dirName, "migration.sql");
      if (!fs.existsSync(sqlPath)) {
        continue;
      }

      if (appliedSet.has(dirName)) {
        continue;
      }

      const sql = fs.readFileSync(sqlPath, "utf-8");
      await client.query(sql);
      await client.query(
        "INSERT INTO _queueflow_test_migrations (migration_name) VALUES ($1)",
        [dirName],
      );
      console.log(`[setup-test-db] Applied migration: ${dirName}`);
    }

    console.log(
      "[setup-test-db] All migrations are up to date in queueflow_test.",
    );
  } catch (err) {
    console.error(
      "[setup-test-db] Error:",
      sanitizeErrorMessage(err, rawUrl),
    );
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Execute if run directly from CLI
if (require.main === module || process.argv[1]?.endsWith("setup-test-db.ts")) {
  setupTestDatabase().catch((err) => {
    console.error(
      "Fatal setup error:",
      sanitizeErrorMessage(err),
    );
    process.exit(1);
  });
}
