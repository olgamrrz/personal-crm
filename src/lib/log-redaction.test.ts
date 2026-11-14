import { inspect } from "node:util";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, groups } from "@/db/schema";
import { insertContact } from "@/lib/contacts";
import { installLogRedaction, redactDatabaseError } from "@/lib/log-redaction";
import type { ContactInput } from "@/lib/validation";

import { makeUser } from "../../test/factories";

const ivan = {
  name: "Иван Петров",
  about: "дизайнер, бывший коллега",
  howWeMet: "на конференции в Казани",
  phone: "+7 900 123-45-67",
  email: "ivan@example.com",
};

// What a log line would show: the whole error with every nested cause
function printed(value: unknown) {
  return inspect(value, { depth: Infinity });
}

function expectNoPersonalData(text: string, values: string[]) {
  for (const value of values) {
    expect(text.toLowerCase()).not.toContain(value.toLowerCase());
  }
}

async function failure(query: PromiseLike<unknown>): Promise<Error & { digest?: string }> {
  try {
    await query;
  } catch (error) {
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error("Expected the query to fail");
}

// A real failed save: the database rejects the row, and Postgres describes the row in the error
async function failedContactSave() {
  const owner = await makeUser();
  return failure(
    insertContact(
      owner.id,
      {
        ...ivan,
        birthdayDay: null,
        birthdayMonth: null,
        birthdayYear: null,
        contactFrequency: "daily",
      } as ContactInput,
      [],
    ),
  );
}

describe("redactDatabaseError", () => {
  it("removes the values of a failed contact save but keeps the query and the reason", async () => {
    const error = await failedContactSave();
    // The test only means something if the raw error really carries the data
    expect(printed(error)).toContain(ivan.email);

    const text = printed(redactDatabaseError(error));

    expectNoPersonalData(text, [...Object.values(ivan), "daily"]);
    expect(text).toContain('insert into "contacts"');
    expect(text).toContain("23514");
    expect(text).toContain("contacts_contact_frequency_check");
  });

  it("removes a group name that Postgres repeats in the details of a duplicate", async () => {
    const owner = await makeUser();
    await db.insert(groups).values({ ownerId: owner.id, name: "Друзья" });
    const error = await failure(db.insert(groups).values({ ownerId: owner.id, name: "друзья" }));
    expect(printed(error)).toContain("друзья");

    const text = printed(redactDatabaseError(error));

    expectNoPersonalData(text, ["друзья"]);
    expect(text).toContain('insert into "groups"');
    expect(text).toContain("23505");
  });

  it("keeps the connection problem when the database is unreachable, without the values", async () => {
    // Nothing listens on port 1, so the connection is refused
    const client = postgres("postgresql://postgres@127.0.0.1:1/crm", { max: 1, connect_timeout: 2 });
    try {
      const error = await failure(
        drizzle(client)
          .insert(contacts)
          .values({ ...ivan, ownerId: "owner" }),
      );
      expect(printed(error)).toContain(ivan.email);

      const text = printed(redactDatabaseError(error));

      expectNoPersonalData(text, Object.values(ivan));
      expect(text).toContain('insert into "contacts"');
      expect(text).toContain("ECONNREFUSED");
    } finally {
      await client.end();
    }
  });

  it("keeps the digest Next.js gives the error, so the failure can be found in the log", async () => {
    const error = await failedContactSave();
    error.digest = "1234567890";

    expect(redactDatabaseError(error)).toMatchObject({ digest: "1234567890" });
  });

  it("leaves the original error untouched, so the app can still read the database code", async () => {
    const error = await failedContactSave();

    redactDatabaseError(error);

    expect(printed(error)).toContain(ivan.email);
    expect((error.cause as { code?: string }).code).toBe("23514");
  });

  it("passes other errors and plain values through as they are", () => {
    const other = new Error("Something else went wrong");

    expect(redactDatabaseError(other)).toBe(other);
    expect(redactDatabaseError("Saving failed:")).toBe("Saving failed:");
    expect(redactDatabaseError(42)).toBe(42);
  });
});

describe("installLogRedaction", () => {
  const methods = ["error", "warn", "log", "info", "debug"] as const;

  function recordingConsole() {
    const calls: unknown[][] = [];
    const target = Object.fromEntries(
      methods.map((method) => [method, (...args: unknown[]) => void calls.push(args)]),
    ) as Record<(typeof methods)[number], (...args: unknown[]) => void>;
    return { target, calls };
  }

  it.each(methods)("redacts database errors printed with console.%s", async (method) => {
    const { target, calls } = recordingConsole();
    const error = await failedContactSave();

    installLogRedaction(target);
    target[method]("Saving failed:", error);

    expect(calls).toHaveLength(1);
    const [label, logged] = calls[0];
    expect(label).toBe("Saving failed:");
    expectNoPersonalData(printed(logged), Object.values(ivan));
    expect(printed(logged)).toContain('insert into "contacts"');
  });

  it("does not wrap the console twice", () => {
    const { target } = recordingConsole();

    installLogRedaction(target);
    const wrapped = target.error;
    installLogRedaction(target);

    expect(target.error).toBe(wrapped);
  });
});
