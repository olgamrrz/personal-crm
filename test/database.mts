// Where the tests keep their data. They never touch the working database:
// the test database is a separate one next to it, named <working name>_test.

// A default import of CommonJS @next/env, as in scripts/seed.mts: this file is loaded by plain Node
import nextEnv from "@next/env";

export const TEST_DATABASE_SUFFIX = "_test";

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

export function getTestDatabase() {
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

  const name = workingName.endsWith(TEST_DATABASE_SUFFIX)
    ? workingName
    : `${workingName}${TEST_DATABASE_SUFFIX}`;
  assertTestDatabaseName(name);

  return {
    name,
    url: withDatabase(url, name),
    // The test database may not exist yet, so it is created through the "postgres" database every server has
    adminUrl: withDatabase(url, "postgres"),
  };
}
