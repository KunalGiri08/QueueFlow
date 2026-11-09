import dotenv from "dotenv";
import fs from "fs";
import { defineConfig } from "prisma/config";

// Load local overrides first without replacing existing system variables.
dotenv.config({ path: ".env.local" });

// Load base .env values only when variables are still undefined.
dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["PRISMA_DATABASE_URL"] ?? process.env["DATABASE_URL"],
  },
});
