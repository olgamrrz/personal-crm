// Runs once before all tests: creates the test database if it is missing and applies the migrations,
// with the same migrator as scripts/migrate.mts.

import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { assertTestDatabaseName, getTestDatabase, quoteIdentifier } from "./database.mts";

export default async function setup() {
  const testDatabase = getTestDatabase();
  assertTestDatabaseName(testDatabase.name);

  const admin = postgres(testDatabase.adminUrl, { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${testDatabase.name}`;
    if (existing.length === 0) {
      await admin.unsafe(`create database ${quoteIdentifier(testDatabase.name)}`);
    }
  } finally {
    await admin.end();
  }

  const client = postgres(testDatabase.url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
    });
  } finally {
    await client.end();
  }
}
