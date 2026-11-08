// The calculation behind keep-in-touch (openspec/specs/keep-in-touch/spec.md): when it is time to reach out,
// what counts as the last conversation, the order of the "Пора связаться" block. One describe per requirement,
// one test per scenario. Dates are Moscow time, like in the spec, and "today" is passed in, so the result does
// not depend on the day the tests run. The tests that check the app's own path leave "today" to the database
// clock and count back from it.

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contacts, notes, type User } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";
import {
  getLastContact,
  listOverdueContacts,
  recordConversation,
  updateContactFrequency,
} from "@/lib/contacts";

import { countRows, makeContact, makeNote, makeUser } from "../../test/factories";

// Whose data the tests work with; the tests of other people's data make a second one
let owner: User;

beforeEach(async () => {
  owner = await makeUser();
});

// Moscow is UTC+3 all year round. Without a time it is noon, away from the edges of the day.
function moscow(dateTime: string) {
  const [date, time = "12:00"] = dateTime.split(" ");
  return new Date(`${date}T${time}:00+03:00`);
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// The contact's row in the block, or undefined when it is not there
async function inBlock(name: string, today?: Date) {
  return (await listOverdueContacts(owner.id, today)).find((contact) => contact.name === name);
}

async function blockNames(today?: Date) {
  return (await listOverdueContacts(owner.id, today)).map((contact) => contact.name);
}

// A contact with a frequency whose last conversation is a note written at `talkedAt`
async function contactTalkedTo(name: string, frequency: ContactFrequency, talkedAt: Date) {
  const contact = await makeContact(owner.id, name, {
    contactFrequency: frequency,
    contactFrequencySetAt: new Date("2025-01-01T00:00:00Z"),
  });
  await makeNote(contact.id, "Созвонились", talkedAt);
  return contact;
}

describe("frequency in the contact card", () => {
  it("resetting the frequency takes the contact out of the block", async () => {
    const ivan = await contactTalkedTo("Иван", "month", daysAgo(100));
    expect(await inBlock("Иван")).toBeDefined();

    expect(await updateContactFrequency(owner.id, ivan.id, null)).toBe(true);

    expect(await inBlock("Иван")).toBeUndefined();
    const [stored] = await db.select().from(contacts).where(eq(contacts.id, ivan.id));
    expect(stored).toMatchObject({ contactFrequency: null, contactFrequencySetAt: null });
  });
});

describe("last conversation", () => {
  it("a new note restarts the countdown", async () => {
    const ivan = await contactTalkedTo("Иван", "month", daysAgo(100));
    expect(await inBlock("Иван")).toBeDefined();

    await makeNote(ivan.id, "Поговорили про отпуск");

    expect(await inBlock("Иван")).toBeUndefined();
  });

  it("«Пообщались» restarts the countdown and adds no note", async () => {
    const ivan = await contactTalkedTo("Иван", "month", daysAgo(100));
    expect(await inBlock("Иван")).toBeDefined();

    expect(await recordConversation(owner.id, ivan.id)).toBe(true);

    expect(await inBlock("Иван")).toBeUndefined();
    expect(await countRows(notes)).toBe(1);
  });

  it("a mark later than the note is the last conversation", async () => {
    const ivan = await contactTalkedTo("Иван", "month", moscow("2026-09-01"));
    await recordConversation(owner.id, ivan.id, moscow("2026-09-10"));

    expect(await getLastContact(owner.id, ivan.id, moscow("2026-09-20"))).toEqual({
      day: "2026-09-10",
      isToday: false,
    });
    // A month from September 10
    expect(await inBlock("Иван", moscow("2026-10-10"))).toBeUndefined();
    expect(await inBlock("Иван", moscow("2026-10-11"))).toMatchObject({ overdueDays: 1 });
  });

  it("a note later than the mark is the last conversation", async () => {
    const ivan = await makeContact(owner.id, "Иван", {
      contactFrequency: "month",
      contactFrequencySetAt: moscow("2026-08-01"),
    });
    await recordConversation(owner.id, ivan.id, moscow("2026-09-10"));
    await makeNote(ivan.id, "Созвонились", moscow("2026-09-15"));

    expect(await getLastContact(owner.id, ivan.id, moscow("2026-09-20"))).toEqual({
      day: "2026-09-15",
      isToday: false,
    });
    // A month from September 15
    expect(await inBlock("Иван", moscow("2026-10-15"))).toBeUndefined();
    expect(await inBlock("Иван", moscow("2026-10-16"))).toMatchObject({ overdueDays: 1 });
  });

  it("without any conversation the countdown starts when the frequency is chosen", async () => {
    const ivan = await makeContact(owner.id, "Иван");

    await updateContactFrequency(owner.id, ivan.id, "week", moscow("2026-10-01 10:00"));

    expect(await inBlock("Иван", moscow("2026-10-01 18:00"))).toBeUndefined();
    expect(await inBlock("Иван", moscow("2026-10-09 10:00"))).toMatchObject({ overdueDays: 1 });
  });

  it("changing the frequency before any conversation restarts the countdown", async () => {
    const ivan = await makeContact(owner.id, "Иван");

    await updateContactFrequency(owner.id, ivan.id, "week", moscow("2026-10-01"));
    await updateContactFrequency(owner.id, ivan.id, "month", moscow("2026-10-05"));

    // Due November 5: a month from the change, not a week from October 1
    expect(await inBlock("Иван", moscow("2026-11-05"))).toBeUndefined();
    expect(await inBlock("Иван", moscow("2026-11-06"))).toMatchObject({ frequency: "month", overdueDays: 1 });
  });

  it("changing the frequency after a conversation keeps counting from the conversation", async () => {
    const ivan = await makeContact(owner.id, "Иван");
    await updateContactFrequency(owner.id, ivan.id, "quarter", moscow("2026-08-01"));
    await makeNote(ivan.id, "Созвонились", moscow("2026-09-01"));

    await updateContactFrequency(owner.id, ivan.id, "month", moscow("2026-10-20"));

    // Due October 1, so the contact is in the block at once
    expect(await inBlock("Иван", moscow("2026-10-20"))).toMatchObject({
      frequency: "month",
      overdueDays: 19,
    });
    expect(await getLastContact(owner.id, ivan.id, moscow("2026-10-20"))).toEqual({
      day: "2026-09-01",
      isToday: false,
    });
  });
});

describe("when it is time to reach out", () => {
  it("is not overdue on the due day yet", async () => {
    await contactTalkedTo("Иван", "week", moscow("2026-10-01"));

    expect(await inBlock("Иван", moscow("2026-10-08"))).toBeUndefined();
  });

  it("is overdue by 1 day the day after the due day", async () => {
    await contactTalkedTo("Иван", "week", moscow("2026-10-01"));

    expect(await inBlock("Иван", moscow("2026-10-09"))).toMatchObject({ overdueDays: 1 });
  });

  it("counts a month by the calendar", async () => {
    await contactTalkedTo("Иван", "month", moscow("2026-03-15"));

    // Due April 15
    expect(await inBlock("Иван", moscow("2026-04-20"))).toMatchObject({ overdueDays: 5 });
  });

  it("moves the due day to the last day of a shorter month", async () => {
    await contactTalkedTo("Иван", "month", moscow("2026-01-31"));

    // Due February 28, 2026
    expect(await inBlock("Иван", moscow("2026-02-28"))).toBeUndefined();
    expect(await inBlock("Иван", moscow("2026-03-01"))).toMatchObject({ overdueDays: 1 });
  });

  it("counts a quarter as 3 months and a year up to the same date", async () => {
    await contactTalkedTo("Анна", "quarter", moscow("2026-01-15"));
    await contactTalkedTo("Борис", "year", moscow("2025-03-10"));

    expect(await inBlock("Анна", moscow("2026-04-15"))).toBeUndefined();
    expect(await inBlock("Анна", moscow("2026-04-16"))).toMatchObject({ overdueDays: 1 });
    expect(await inBlock("Борис", moscow("2026-03-10"))).toBeUndefined();
    expect(await inBlock("Борис", moscow("2026-03-11"))).toMatchObject({ overdueDays: 1 });
  });

  it("counts calendar days in Moscow, not hours", async () => {
    await contactTalkedTo("Иван", "week", moscow("2026-10-01 23:50"));

    // 7 days and 20 minutes later, but already the day after the due day in Moscow
    expect(await inBlock("Иван", moscow("2026-10-09 00:10"))).toMatchObject({ overdueDays: 1 });
  });

  it("leaves out a contact without a frequency", async () => {
    const ivan = await makeContact(owner.id, "Иван");
    await makeNote(ivan.id, "Созвонились", moscow("2025-10-01"));

    expect(await listOverdueContacts(owner.id, moscow("2026-10-01"))).toEqual([]);
  });
});

describe("the block on the home page", () => {
  it("shows an overdue contact with its frequency and the days overdue", async () => {
    const ivan = await contactTalkedTo("Иван", "month", moscow("2026-07-01"));

    // Due August 1
    expect(await listOverdueContacts(owner.id, moscow("2026-10-01"))).toEqual([
      { id: ivan.id, name: "Иван", frequency: "month", overdueDays: 61 },
    ]);
  });

  it("leaves out a deleted contact", async () => {
    const ivan = await contactTalkedTo("Иван", "month", moscow("2026-06-01"));
    expect(await inBlock("Иван", moscow("2026-10-01"))).toBeDefined();

    await db.delete(contacts).where(eq(contacts.id, ivan.id));

    expect(await listOverdueContacts(owner.id, moscow("2026-10-01"))).toEqual([]);
  });
});

describe("last conversation in the card", () => {
  it("is the day of the latest note", async () => {
    const ivan = await contactTalkedTo("Иван", "month", moscow("2026-09-19"));

    expect(await getLastContact(owner.id, ivan.id, moscow("2026-10-01"))).toEqual({
      day: "2026-09-19",
      isToday: false,
    });
  });

  it("is empty when there has been no conversation yet", async () => {
    const ivan = await makeContact(owner.id, "Иван");
    await updateContactFrequency(owner.id, ivan.id, "month");

    expect(await getLastContact(owner.id, ivan.id)).toEqual({ day: null, isToday: false });
  });

  it("is today right after «Пообщались»", async () => {
    const ivan = await contactTalkedTo("Иван", "month", daysAgo(100));

    await recordConversation(owner.id, ivan.id);

    expect(await getLastContact(owner.id, ivan.id)).toMatchObject({ isToday: true });
  });

  it("is today by the Moscow calendar", async () => {
    const ivan = await contactTalkedTo("Иван", "month", moscow("2026-09-01"));
    await recordConversation(owner.id, ivan.id, moscow("2026-10-08 23:50"));

    // Ten minutes later it is already the next day in Moscow
    expect(await getLastContact(owner.id, ivan.id, moscow("2026-10-09 00:10"))).toEqual({
      day: "2026-10-08",
      isToday: false,
    });
    expect(await getLastContact(owner.id, ivan.id, moscow("2026-10-08 23:55"))).toEqual({
      day: "2026-10-08",
      isToday: true,
    });
  });
});

describe("order in the block", () => {
  it("puts the more overdue contact higher, whatever the frequency", async () => {
    // Due October 16 and October 1
    await contactTalkedTo("Анна", "week", moscow("2026-10-09"));
    await contactTalkedTo("Борис", "year", moscow("2025-10-01"));

    const block = await listOverdueContacts(owner.id, moscow("2026-10-21"));

    expect(block.map(({ name, overdueDays }) => ({ name, overdueDays }))).toEqual([
      { name: "Борис", overdueDays: 20 },
      { name: "Анна", overdueDays: 5 },
    ]);
  });

  it("puts contacts with the same overdue in alphabetical order", async () => {
    await contactTalkedTo("Борис", "month", moscow("2026-06-01"));
    await contactTalkedTo("Анна", "month", moscow("2026-06-01"));

    expect(await blockNames(moscow("2026-10-01"))).toEqual(["Анна", "Борис"]);
  });
});

describe("updateContactFrequency and recordConversation", () => {
  it("say the contact is not found when there is no such contact", async () => {
    expect(await updateContactFrequency(owner.id, 9999, "week")).toBe(false);
    expect(await recordConversation(owner.id, 9999)).toBe(false);
  });
});
