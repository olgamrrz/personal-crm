// Applies pending migrations from ./drizzle and exits.
// Production runs it as a one-off container before the new app image starts:
//   docker compose -p prod run --rm migrate
// Locally use `pnpm db:migrate` (drizzle-kit); both record applied migrations in the same table.

import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });

try {
  await migrate(drizzle(client), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Migrations applied.");
} catch (error) {
  console.error("Migrations failed:", error);
  process.exitCode = 1;
} finally {
  await client.end();
}
