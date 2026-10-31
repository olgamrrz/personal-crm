import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

import { getTestDatabase } from "./test/database.mts";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    setupFiles: ["./test/setup.ts"],
    // There is one test database, so test files run one after another
    fileParallelism: false,
    // The app code reads DATABASE_URL, so inside tests it points at the test database
    env: { DATABASE_URL: getTestDatabase().url },
  },
});
