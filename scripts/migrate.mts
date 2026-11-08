// Applies pending migrations from ./drizzle and exits.
// Production runs it as a one-off container before the new app image starts:
//   docker compose -p prod run --rm migrate
// Locally: `pnpm db:migrate`. It reads .env like the app does.
//
// OWNER_EMAIL is the address of the person who owns the data that exists before sign-in was added. The migration
// 0004_owners reads it; without it, a database that has contacts is not migrated and nothing is changed.

import { fileURLToPath, pathToFileURL } from "node:url";

// .mts and a default import of CommonJS @next/env: works the same under tsx (locally) and plain node (Docker image)
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

// One connection for everything: the setting for the migrations lives as long as the connection does.
// The migrations run in a single transaction, so a failed one leaves the database as it was.
export async function applyMigrations({
  databaseUrl,
  ownerEmail,
  migrationsFolder = DEFAULT_MIGRATIONS_FOLDER,
}: {
  databaseUrl: string;
  ownerEmail?: string;
  migrationsFolder?: string;
}) {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    if (ownerEmail) {
      await client`select set_config('app.owner_email', ${ownerEmail}, false)`;
    }
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

// Runs only when started as a script, not when a test imports applyMigrations
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  nextEnv.loadEnvConfig(process.cwd());

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  try {
    await applyMigrations({ databaseUrl, ownerEmail: process.env.OWNER_EMAIL });
    console.log("Migrations applied.");
  } catch (error) {
    console.error("Migrations failed:", error);
    process.exitCode = 1;
  }
}
