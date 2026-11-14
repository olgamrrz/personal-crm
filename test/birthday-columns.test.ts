// The last line of defence for the birthday of a contact: what the database itself refuses, whatever the app does.
// The queries are written by hand, so the app code cannot hide a missing constraint.

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import type { User } from "@/db/schema";

import { makeContact, makeUser } from "./factories";

let owner: User;

beforeEach(async () => {
  owner = await makeUser();
});

// The values are written as SQL, so `null` means a missing value
function save(day: number | null, month: number | null, year: number | null) {
  return db.execute(
    sql`insert into contacts (owner_id, name, birthday_day, birthday_month, birthday_year)
        values (${owner.id}, 'Анна', ${day}::smallint, ${month}::smallint, ${year}::smallint)`,
  );
}

// Refused by a CHECK constraint (error 23514), not by anything else such as a missing column
async function expectRefused(query: PromiseLike<unknown>) {
  const error = await Promise.resolve(query).then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error, "the database accepted the row").toBeDefined();
  expect((error as { cause?: { code?: string } }).cause?.code).toBe("23514");
}

describe("the birthday columns of contacts", () => {
  it("are empty for a contact made without a birthday", async () => {
    const contact = await makeContact(owner.id);

    const [row] = await db.execute(
      sql`select birthday_day, birthday_month, birthday_year from contacts where id = ${contact.id}`,
    );
    expect(row).toEqual({ birthday_day: null, birthday_month: null, birthday_year: null });
  });

  it("accept no date, a day and a month, and a full date", async () => {
    await expect(save(null, null, null)).resolves.toBeDefined();
    await expect(save(14, 3, null)).resolves.toBeDefined();
    await expect(save(14, 3, 1990)).resolves.toBeDefined();
  });

  it("refuse a day without a month, and a month without a day", async () => {
    await expectRefused(save(14, null, null));
    await expectRefused(save(null, 3, null));
  });

  it("refuse a month outside 1-12", async () => {
    await expectRefused(save(14, 13, null));
    await expectRefused(save(14, 0, null));
  });

  it("refuse a day outside 1-31", async () => {
    await expectRefused(save(0, 3, null));
    await expectRefused(save(32, 3, null));
  });

  it("refuse a day that the month does not have", async () => {
    await expectRefused(save(31, 4, null));
    await expectRefused(save(31, 6, null));
    await expectRefused(save(31, 9, null));
    await expectRefused(save(31, 11, null));
    await expectRefused(save(30, 2, null));
  });

  it("accept the last day of every month, and 29 February", async () => {
    const lastDays = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (const [index, day] of lastDays.entries()) {
      await expect(save(day, index + 1, null)).resolves.toBeDefined();
    }
  });

  it("refuse a year without a day and a month", async () => {
    await expectRefused(save(null, null, 1990));
  });
});
