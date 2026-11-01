// Runs in every test file: each test starts with empty tables, and the connection is closed at the end.

import { afterAll, beforeEach } from "vitest";

import { db } from "@/db";

import { clearTestDatabase } from "./database-setup.mts";

beforeEach(async () => {
  // The same connection the app code uses, so it is the database the code under test works with
  await clearTestDatabase(db.$client);
});

afterAll(async () => {
  await db.$client.end();
});
