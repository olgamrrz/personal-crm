// Direct access to the database of the browser tests: a clean start before each test, and the contacts
// a test needs before it opens the app. It does not go through the app code, so a bug there cannot hide
// behind the setup.

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts } from "@/db/schema";

import { E2E_DATABASE_SUFFIX, getTestDatabase } from "../test/database.mts";
import { clearTestDatabase } from "../test/database-setup.mts";

// A connection per call: a test touches the database once or twice, and nothing is left open
async function withDatabase<T>(work: (client: postgres.Sql) => Promise<T>) {
  const client = postgres(getTestDatabase(E2E_DATABASE_SUFFIX).url, { max: 1, onnotice: () => {} });
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export function resetDatabase() {
  return withDatabase(clearTestDatabase);
}

export function insertContacts(names: string[]) {
  return withDatabase(async (client) => {
    await drizzle(client)
      .insert(contacts)
      .values(names.map((name) => ({ name })));
  });
}
