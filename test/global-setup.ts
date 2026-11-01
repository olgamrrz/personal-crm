// Runs once before all unit tests: creates the test database if it is missing and applies the migrations.

import { getTestDatabase } from "./database.mts";
import { prepareTestDatabase } from "./database-setup.mts";

export default async function setup() {
  await prepareTestDatabase(getTestDatabase());
}
