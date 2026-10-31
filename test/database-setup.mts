// Shared by the unit tests (test/) and the browser tests (e2e/): each kind has its own test database
// and prepares and clears it the same way.

import path from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { assertTestDatabaseName, quoteIdentifier, type TestDatabase } from "./database.mts";

// Creates the test database if it is missing and applies the migrations, with the same migrator
// as scripts/migrate.mts
export async function prepareTestDatabase(testDatabase: TestDatabase) {
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
    // Both test runners start in the project root, as getTestDatabase() expects too.
    // Not import.meta: Playwright's loader turns this file into CommonJS, where it does not exist.
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  } finally {
    await client.end();
  }
}

// Empties every table, so a test starts from scratch. The client says which database it is connected to,
// and a database that is not a test one is refused before anything is deleted.
export async function clearTestDatabase(client: postgres.Sql) {
  // One query: which database this is, and which tables it has. The migration journal is not in "public".
  const [info] = await client<{ name: string; tables: string[] }[]>`
    select
      current_database() as name,
      array(select quote_ident(tablename) from pg_tables where schemaname = 'public') as tables
  `;

  assertTestDatabaseName(info.name);
  if (info.tables.length > 0) {
    await client.unsafe(`truncate table ${info.tables.join(", ")} restart identity cascade`);
  }
}
