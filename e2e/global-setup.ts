// Runs once before the browser tests, after the app server has started: creates their database if it is
// missing and applies the migrations.

import { E2E_DATABASE_SUFFIX, getTestDatabase } from "../test/database.mts";
import { prepareTestDatabase } from "../test/database-setup.mts";

export default async function globalSetup() {
  await prepareTestDatabase(getTestDatabase(E2E_DATABASE_SUFFIX));
}
