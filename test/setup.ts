// Runs in every test file: each test starts with empty tables, and the connection is closed at the end.

import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";

import { db } from "@/db";

import { assertTestDatabaseName } from "./database.mts";

beforeEach(async () => {
  // One query: which database this is, and which tables it has. The migration journal is not in "public".
  const [info] = await db.execute<{ name: string; tables: string[] }>(sql`
    select
      current_database() as name,
      array(select quote_ident(tablename) from pg_tables where schemaname = 'public') as tables
  `);

  assertTestDatabaseName(info.name);
  if (info.tables.length > 0) {
    await db.execute(sql.raw(`truncate table ${info.tables.join(", ")} restart identity cascade`));
  }
});

afterAll(async () => {
  await db.$client.end();
});
