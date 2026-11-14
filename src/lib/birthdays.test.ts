// The calculation behind contact birthdays (openspec/changes/birthdays/specs/contact-birthdays/spec.md): who has a
// birthday in the coming 7 days, how old they turn, the order of the "Скоро день рождения" block, and saving the date.
// Dates are Moscow time, like in the spec, and "today" is passed in, so the result does not depend on the day the
// tests run.

import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "@/db/schema";
import {
  currentYearInMoscow,
  getContact,
  insertContact,
  listUpcomingBirthdays,
  updateContactBirthday,
} from "@/lib/contacts";

import { makeContact, makeUser } from "../../test/factories";

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

// A contact with a birthday written as "14.11" or "14.11.1990"
function makeBirthdayContact(ownerId: string, name: string, birthday: string) {
  const [day, month, year] = birthday.split(".").map(Number);
  return makeContact(ownerId, name, {
    birthdayDay: day,
    birthdayMonth: month,
    birthdayYear: year ?? null,
  });
}

// The row of the contact in the block, or undefined when it is not there
async function inBlock(birthday: string, today: Date, ownerId = owner.id) {
  const name = `Именинник ${birthday}`;
  await makeBirthdayContact(ownerId, name, birthday);
  return (await listUpcomingBirthdays(ownerId, today)).find((row) => row.name === name);
}

describe("listUpcomingBirthdays: when a birthday is soon", () => {
  it("includes a birthday today", async () => {
    expect(await inBlock("14.11", moscow("2026-11-14"))).toMatchObject({ day: 14, month: 11, daysUntil: 0 });
  });

  it("includes a birthday in 6 days", async () => {
    expect(await inBlock("20.11", moscow("2026-11-14"))).toMatchObject({ daysUntil: 6 });
  });

  it("leaves out a birthday in 7 days", async () => {
    expect(await inBlock("21.11", moscow("2026-11-14"))).toBeUndefined();
  });

  it("leaves out yesterday's birthday: the next one is a year away", async () => {
    expect(await inBlock("13.11", moscow("2026-11-14"))).toBeUndefined();
  });

  it("looks across the end of the year", async () => {
    expect(await inBlock("02.01", moscow("2026-12-29"))).toMatchObject({ daysUntil: 4 });
    expect(await inBlock("05.01", moscow("2026-12-29"))).toBeUndefined();
  });

  it("counts 29 February as 28 February in a year that has no 29 February", async () => {
    // 2027 is not a leap year
    expect(await inBlock("29.02", moscow("2027-02-26"))).toMatchObject({ daysUntil: 2 });
  });

  it("is a day on 28 February itself, and over after it, in a year without 29 February", async () => {
    expect(await inBlock("29.02", moscow("2027-02-28"))).toMatchObject({ daysUntil: 0 });
    expect(await inBlock("29.02", moscow("2027-03-01"))).toBeUndefined();
  });

  it("keeps 29 February in a leap year", async () => {
    // 2028 is a leap year
    expect(await inBlock("29.02", moscow("2028-02-26"))).toMatchObject({ daysUntil: 3 });
    expect(await inBlock("29.02", moscow("2028-02-29"))).toMatchObject({ daysUntil: 0 });
  });

  it("looks at 29 February of the next year when it is a leap year", async () => {
    // From 24 February 2027 the next birthday is 28 February 2027; on 1 March 2027 it is 29 February 2028
    expect(await inBlock("29.02", moscow("2027-02-24"))).toMatchObject({ daysUntil: 4 });
  });

  it("counts the days by Moscow time", async () => {
    // 00:10 on 15 November in Moscow is still 14 November (21:10) in Greenwich
    const justAfterMidnight = moscow("2026-11-15 00:10");
    expect(justAfterMidnight.toISOString()).toBe("2026-11-14T21:10:00.000Z");

    expect(await inBlock("15.11", justAfterMidnight)).toMatchObject({ daysUntil: 0 });
    expect(await inBlock("14.11", justAfterMidnight)).toBeUndefined();
  });

  it("counts whole days, whatever the time of the day", async () => {
    expect(await inBlock("15.11", moscow("2026-11-14 23:50"))).toMatchObject({ daysUntil: 1 });
  });

  it("does not depend on the year of birth", async () => {
    await makeBirthdayContact(owner.id, "С годом", "16.11.1950");
    await makeBirthdayContact(owner.id, "Без года", "16.11");

    const rows = await listUpcomingBirthdays(owner.id, moscow("2026-11-14"));
    expect(rows.map((row) => [row.name, row.daysUntil])).toEqual([
      ["Без года", 2],
      ["С годом", 2],
    ]);
  });

  it("leaves out contacts without a birthday", async () => {
    await makeContact(owner.id, "Без даты");

    expect(await listUpcomingBirthdays(owner.id, moscow("2026-11-14"))).toEqual([]);
  });
});

describe("listUpcomingBirthdays: how old they turn", () => {
  it("tells the age they turn when the year is known", async () => {
    expect(await inBlock("17.11.1990", moscow("2026-11-14"))).toMatchObject({ turning: 36 });
  });

  it("tells the age they turn today", async () => {
    expect(await inBlock("14.11.1990", moscow("2026-11-14"))).toMatchObject({ daysUntil: 0, turning: 36 });
  });

  it("counts the age by the year of the birthday, across the end of the year", async () => {
    expect(await inBlock("02.01.1990", moscow("2026-12-29"))).toMatchObject({ daysUntil: 4, turning: 37 });
  });

  it("counts the age of a 29 February birthday in a year without it", async () => {
    expect(await inBlock("29.02.2000", moscow("2027-02-26"))).toMatchObject({ daysUntil: 2, turning: 27 });
  });

  it("has no age without a year", async () => {
    expect(await inBlock("17.11", moscow("2026-11-14"))).toMatchObject({ turning: null });
  });

  it("has no age for somebody born this year", async () => {
    expect(await inBlock("14.11.2026", moscow("2026-11-14"))).toMatchObject({ daysUntil: 0, turning: null });
  });

  it("tells the first birthday", async () => {
    expect(await inBlock("17.11.2025", moscow("2026-11-14"))).toMatchObject({ turning: 1 });
  });
});

describe("listUpcomingBirthdays: the order", () => {
  const today = moscow("2026-11-14");

  it("puts the nearest first", async () => {
    await makeBirthdayContact(owner.id, "Анна", "19.11");
    await makeBirthdayContact(owner.id, "Борис", "15.11");
    await makeBirthdayContact(owner.id, "Вера", "14.11");

    const rows = await listUpcomingBirthdays(owner.id, today);
    expect(rows.map((row) => [row.name, row.daysUntil])).toEqual([
      ["Вера", 0],
      ["Борис", 1],
      ["Анна", 5],
    ]);
  });

  it("goes by name when the date is the same", async () => {
    await makeBirthdayContact(owner.id, "Борис", "16.11");
    await makeBirthdayContact(owner.id, "Анна", "16.11");

    expect((await listUpcomingBirthdays(owner.id, today)).map((row) => row.name)).toEqual(["Анна", "Борис"]);
  });

  it("sorts names the Russian way, with Ё next to Е", async () => {
    await makeBirthdayContact(owner.id, "Ёлкин", "16.11");
    await makeBirthdayContact(owner.id, "Жуков", "16.11");
    await makeBirthdayContact(owner.id, "Егоров", "16.11");

    expect((await listUpcomingBirthdays(owner.id, today)).map((row) => row.name)).toEqual([
      "Егоров",
      "Ёлкин",
      "Жуков",
    ]);
  });

  it("keeps the order of creation for the same name and date", async () => {
    const first = await makeBirthdayContact(owner.id, "Анна", "16.11");
    const second = await makeBirthdayContact(owner.id, "Анна", "16.11");

    expect((await listUpcomingBirthdays(owner.id, today)).map((row) => row.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("puts a birthday after the end of the year behind the ones before it", async () => {
    await makeBirthdayContact(owner.id, "Анна", "02.01");
    await makeBirthdayContact(owner.id, "Борис", "31.12");

    expect(
      (await listUpcomingBirthdays(owner.id, moscow("2026-12-29"))).map((row) => [row.name, row.daysUntil]),
    ).toEqual([
      ["Борис", 2],
      ["Анна", 4],
    ]);
  });
});

describe("listUpcomingBirthdays: whose contacts", () => {
  it("shows only the contacts of the owner", async () => {
    const other = await makeUser();
    await makeBirthdayContact(owner.id, "Мой", "15.11");
    await makeBirthdayContact(other.id, "Чужой", "15.11");

    const today = moscow("2026-11-14");
    expect((await listUpcomingBirthdays(owner.id, today)).map((row) => row.name)).toEqual(["Мой"]);
    expect((await listUpcomingBirthdays(other.id, today)).map((row) => row.name)).toEqual(["Чужой"]);
  });

  it("is empty for somebody who has no contacts", async () => {
    const other = await makeUser();
    await makeBirthdayContact(owner.id, "Мой", "15.11");

    expect(await listUpcomingBirthdays(other.id, moscow("2026-11-14"))).toEqual([]);
  });

  it("works with the clock of the database when no moment is given", async () => {
    await makeBirthdayContact(owner.id, "Далеко", "01.01");

    // Whatever the day is, the call must work and must not return what is not soon
    const rows = await listUpcomingBirthdays(owner.id);
    expect(rows.every((row) => row.daysUntil >= 0 && row.daysUntil <= 6)).toBe(true);
  });
});

describe("updateContactBirthday", () => {
  async function stored(contactId: number) {
    const contact = await getContact(owner.id, contactId);
    return [contact?.birthdayDay, contact?.birthdayMonth, contact?.birthdayYear];
  }

  it("sets a date", async () => {
    const contact = await makeContact(owner.id);

    expect(await updateContactBirthday(owner.id, contact.id, { day: 14, month: 3, year: 1990 })).toBe(true);
    expect(await stored(contact.id)).toEqual([14, 3, 1990]);
  });

  it("sets a date without a year", async () => {
    const contact = await makeContact(owner.id);

    await updateContactBirthday(owner.id, contact.id, { day: 14, month: 3, year: null });
    expect(await stored(contact.id)).toEqual([14, 3, null]);
  });

  it("changes a date", async () => {
    const contact = await makeBirthdayContact(owner.id, "Анна", "14.03.1990");

    await updateContactBirthday(owner.id, contact.id, { day: 15, month: 3, year: 1991 });
    expect(await stored(contact.id)).toEqual([15, 3, 1991]);
  });

  it("drops the year when the new date has none", async () => {
    const contact = await makeBirthdayContact(owner.id, "Анна", "14.03.1990");

    await updateContactBirthday(owner.id, contact.id, { day: 14, month: 3, year: null });
    expect(await stored(contact.id)).toEqual([14, 3, null]);
  });

  it("removes the date: all three fields become empty", async () => {
    const contact = await makeBirthdayContact(owner.id, "Анна", "14.03.1990");

    expect(await updateContactBirthday(owner.id, contact.id, null)).toBe(true);
    expect(await stored(contact.id)).toEqual([null, null, null]);
  });

  it("removing a date that is not there is not an error", async () => {
    const contact = await makeContact(owner.id);

    expect(await updateContactBirthday(owner.id, contact.id, null)).toBe(true);
    expect(await stored(contact.id)).toEqual([null, null, null]);
  });

  it("leaves the other fields alone", async () => {
    const contact = await makeContact(owner.id, "Анна", { about: "дизайнер", phone: "+7 900 000-00-00" });

    await updateContactBirthday(owner.id, contact.id, { day: 14, month: 3, year: null });

    expect(await getContact(owner.id, contact.id)).toMatchObject({
      name: "Анна",
      about: "дизайнер",
      phone: "+7 900 000-00-00",
    });
  });

  it("says there is no contact when it does not exist", async () => {
    expect(await updateContactBirthday(owner.id, 999_999, { day: 14, month: 3, year: null })).toBe(false);
  });

  it("says there is no contact for somebody else's, and leaves their date alone", async () => {
    const other = await makeUser();
    const theirs = await makeBirthdayContact(other.id, "Чужой", "14.03.1990");

    expect(await updateContactBirthday(owner.id, theirs.id, { day: 1, month: 1, year: null })).toBe(false);
    expect(await updateContactBirthday(owner.id, theirs.id, null)).toBe(false);

    const contact = await getContact(other.id, theirs.id);
    expect([contact?.birthdayDay, contact?.birthdayMonth, contact?.birthdayYear]).toEqual([14, 3, 1990]);
  });
});

describe("insertContact with a birthday", () => {
  const anna = { name: "Анна", about: null, howWeMet: null, phone: null, email: null };

  it("saves the date together with the contact", async () => {
    const created = await insertContact(
      owner.id,
      { ...anna, birthdayDay: 14, birthdayMonth: 3, birthdayYear: 1990 },
      [],
    );

    expect(await getContact(owner.id, created.id)).toMatchObject({
      birthdayDay: 14,
      birthdayMonth: 3,
      birthdayYear: 1990,
    });
  });

  it("saves a contact without a date", async () => {
    const created = await insertContact(
      owner.id,
      { ...anna, birthdayDay: null, birthdayMonth: null, birthdayYear: null },
      [],
    );

    expect(await getContact(owner.id, created.id)).toMatchObject({
      birthdayDay: null,
      birthdayMonth: null,
      birthdayYear: null,
    });
  });
});

describe("currentYearInMoscow", () => {
  it("is the year of the Moscow calendar, not of Greenwich", () => {
    // 00:30 on 1 January 2027 in Moscow is still 31 December 2026 (21:30) in Greenwich
    expect(currentYearInMoscow(moscow("2027-01-01 00:30"))).toBe(2027);
    expect(currentYearInMoscow(moscow("2026-12-31 23:30"))).toBe(2026);
  });

  it("works without a moment, taking the clock of the server", () => {
    expect(currentYearInMoscow()).toBeGreaterThanOrEqual(2026);
  });
});
