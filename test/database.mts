// Where the tests keep their data. They never touch the working database:
// the test database is a separate one next to it, named <working name>_test.

import * as nextEnvModule from "@next/env";

// @next/env is CommonJS. Plain Node (it loads vitest.config.mts) hands it over as `default`,
// Playwright's TypeScript loader as the module itself, so both shapes are accepted.
const nextEnv: typeof nextEnvModule = Reflect.get(nextEnvModule, "default") ?? nextEnvModule;

export const TEST_DATABASE_SUFFIX = "_test";
// The browser tests (e2e/) clear their tables too, so they get a database of their own
// and do not get in the way of the unit tests running at the same time
export const E2E_DATABASE_SUFFIX = "_e2e_test";

// Tests clear their tables, so every place that is about to do it checks the name first
export function assertTestDatabaseName(name: string) {
  if (!name.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to run tests on database "${name}": the name of a test database must end with "${TEST_DATABASE_SUFFIX}".`,
    );
  }
}

export function quoteIdentifier(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function withDatabase(url: URL, name: string) {
  const copy = new URL(url);
  copy.pathname = `/${encodeURIComponent(name)}`;
  return copy.toString();
}

export type TestDatabase = ReturnType<typeof getTestDatabase>;

export function getTestDatabase(suffix = TEST_DATABASE_SUFFIX) {
  // Load .env the same way Next.js and drizzle.config.ts do
  nextEnv.loadEnvConfig(process.cwd());

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  const url = new URL(databaseUrl);
  const workingName = decodeURIComponent(url.pathname.slice(1));
  if (!workingName) {
    throw new Error("DATABASE_URL has no database name.");
  }

  const name = workingName.endsWith(suffix) ? workingName : `${workingName}${suffix}`;
  assertTestDatabaseName(name);

  return {
    name,
    url: withDatabase(url, name),
    // The test database may not exist yet, so it is created through the "postgres" database every server has
    adminUrl: withDatabase(url, "postgres"),
  };
}
