import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/lib\/prisma$/,
        replacement: fileURLToPath(
          new URL("./tests/helpers/test-prisma.ts", import.meta.url),
        ),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL(".", import.meta.url)),
      },
      {
        find: "server-only",
        replacement: fileURLToPath(
          new URL("./node_modules/server-only/empty.js", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["tests/integration/**/*.test.ts", "**/*.integration.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    passWithNoTests: true,
  },
});
