import { describe, expect, it } from "vitest";

import { assertTestDatabaseName, getTestDatabase } from "./database.mts";

describe("test database guard", () => {
  it("refuses a database whose name does not end with _test", () => {
    expect(() => assertTestDatabaseName("crm")).toThrow(/must end with "_test"/);
    expect(() => assertTestDatabaseName("crm_test_backup")).toThrow();
  });

  it("accepts a database whose name ends with _test", () => {
    expect(() => assertTestDatabaseName("crm_test")).not.toThrow();
  });

  it("derives a _test database from the working one and keeps the server", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/crm";
    try {
      const testDatabase = getTestDatabase();
      expect(testDatabase.name).toBe("crm_test");
      expect(testDatabase.url).toBe("postgres://user:pass@127.0.0.1:5432/crm_test");
      expect(testDatabase.adminUrl).toBe("postgres://user:pass@127.0.0.1:5432/postgres");
    } finally {
      process.env.DATABASE_URL = original;
    }
  });

  it("does not add the suffix twice", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://user:pass@127.0.0.1:5432/crm_test";
    try {
      expect(getTestDatabase().name).toBe("crm_test");
    } finally {
      process.env.DATABASE_URL = original;
    }
  });

  it("runs the app code against the test database", () => {
    // vitest.config.mts points DATABASE_URL at the test database for the whole run
    const name = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
    expect(name.endsWith("_test")).toBe(true);
  });
});
