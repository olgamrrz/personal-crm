// The Server Actions of birthdays, called the way the browser calls them: with the real database. Only what exists
// inside a request is replaced: who is signed in, and the cache of Next.js.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createContact, setContactBirthday } from "@/app/actions";
import type { User } from "@/db/schema";
import { currentYearInMoscow, getContact, listContacts } from "@/lib/contacts";

import { makeContact, makeGroup, makeUser } from "../../test/factories";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/lib/session", () => ({
  requireUser: async () => {
    if (!session.user) throw new Error("not signed in");
    return session.user;
  },
}));
vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => navigation);

let owner: User;

beforeEach(async () => {
  vi.clearAllMocks();
  owner = await makeUser();
  session.user = owner;
});

async function birthdayOf(ownerId: string, contactId: number) {
  const contact = await getContact(ownerId, contactId);
  return [contact?.birthdayDay, contact?.birthdayMonth, contact?.birthdayYear];
}

describe("setContactBirthday", () => {
  it("saves the date and answers with it as it is saved", async () => {
    const contact = await makeContact(owner.id);

    expect(await setContactBirthday(contact.id, "  5.3 ")).toEqual({ value: "05.03" });
    expect(await birthdayOf(owner.id, contact.id)).toEqual([5, 3, null]);

    expect(await setContactBirthday(contact.id, "14.03.1990")).toEqual({ value: "14.03.1990" });
    expect(await birthdayOf(owner.id, contact.id)).toEqual([14, 3, 1990]);
  });

  it("removes the date for an empty text, and answers with an empty text", async () => {
    const contact = await makeContact(owner.id, "Анна", {
      birthdayDay: 14,
      birthdayMonth: 3,
      birthdayYear: 1990,
    });

    expect(await setContactBirthday(contact.id, "")).toEqual({ value: "" });
    expect(await birthdayOf(owner.id, contact.id)).toEqual([null, null, null]);
  });

  it("counts anything but a text as empty: the value comes from the client", async () => {
    for (const value of [null, undefined, 42, { day: 1 }, ["14.03"]]) {
      const contact = await makeContact(owner.id, "Анна", { birthdayDay: 14, birthdayMonth: 3 });

      expect(await setContactBirthday(contact.id, value)).toEqual({ value: "" });
      expect(await birthdayOf(owner.id, contact.id)).toEqual([null, null, null]);
    }
  });

  it("refuses a wrong date with the reason, and keeps the saved one", async () => {
    const contact = await makeContact(owner.id, "Анна", { birthdayDay: 14, birthdayMonth: 3 });

    expect(await setContactBirthday(contact.id, "31.04")).toEqual({ error: "Такой даты нет" });
    expect(await setContactBirthday(contact.id, "завтра")).toEqual({
      error: "Введите дату так: 14.03 или 14.03.1990",
    });
    expect(await birthdayOf(owner.id, contact.id)).toEqual([14, 3, null]);
  });

  it("does not take a year that has not come yet", async () => {
    const contact = await makeContact(owner.id);
    const nextYear = currentYearInMoscow() + 1;

    expect(await setContactBirthday(contact.id, `14.03.${nextYear}`)).toEqual({
      error: "Год не может быть в будущем",
    });
    expect(await setContactBirthday(contact.id, `14.03.${nextYear - 1}`)).toEqual({
      value: `14.03.${nextYear - 1}`,
    });
  });

  it("says «Контакт не найден» for a contact of somebody else, and does not touch it", async () => {
    const other = await makeUser();
    const theirs = await makeContact(other.id, "Чужой", {
      birthdayDay: 14,
      birthdayMonth: 3,
      birthdayYear: 1990,
    });

    expect(await setContactBirthday(theirs.id, "15.03")).toEqual({ error: "Контакт не найден" });
    expect(await setContactBirthday(theirs.id, "")).toEqual({ error: "Контакт не найден" });
    expect(await birthdayOf(other.id, theirs.id)).toEqual([14, 3, 1990]);
  });

  it("says «Контакт не найден» for a contact that does not exist", async () => {
    expect(await setContactBirthday(999_999, "14.03")).toEqual({ error: "Контакт не найден" });
  });

  it("says «Контакт не найден» for an id that cannot be one", async () => {
    for (const id of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2, "5" as unknown as number]) {
      expect(await setContactBirthday(id, "14.03")).toEqual({ error: "Контакт не найден" });
    }
  });

  it("refreshes the home page after a save, and only after a save", async () => {
    const contact = await makeContact(owner.id);

    await setContactBirthday(contact.id, "31.04");
    await setContactBirthday(999_999, "14.03");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    expect(cache.refresh).not.toHaveBeenCalled();

    await setContactBirthday(contact.id, "14.03");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.refresh).toHaveBeenCalledTimes(1);
  });

  it("needs a signed-in person", async () => {
    session.user = null;

    await expect(setContactBirthday(1, "14.03")).rejects.toThrow("not signed in");
  });
});

describe("createContact with a birthday", () => {
  function formWith(fields: Record<string, string>, groupIds: number[] = []) {
    const formData = new FormData();
    for (const [name, value] of Object.entries(fields)) formData.set(name, value);
    for (const id of groupIds) formData.append("groupIds", String(id));
    return formData;
  }

  it("saves the contact with the date", async () => {
    await expect(createContact({}, formWith({ name: "Анна", birthday: "14.03.1990" }))).rejects.toThrow(
      /^redirect:\/\?added=\d+$/,
    );

    const [anna] = await listContacts(owner.id);
    expect(await birthdayOf(owner.id, anna.id)).toEqual([14, 3, 1990]);
  });

  it("saves the contact without a date", async () => {
    await expect(createContact({}, formWith({ name: "Анна", birthday: "" }))).rejects.toThrow(/^redirect:/);

    const [anna] = await listContacts(owner.id);
    expect(await birthdayOf(owner.id, anna.id)).toEqual([null, null, null]);
  });

  it("does not create the contact when the date is wrong, and sends back everything that was typed", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");

    const state = await createContact(
      {},
      formWith({ name: "Анна", phone: "+7 916 555-12-34", birthday: "31.04" }, [tennis.id]),
    );

    expect(state.errors).toEqual({ birthday: "Такой даты нет" });
    expect(state.values).toMatchObject({
      name: "Анна",
      phone: "+7 916 555-12-34",
      birthday: "31.04",
      groupIds: [tennis.id],
    });
    expect(await listContacts(owner.id)).toEqual([]);
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("checks the date on the server together with the other fields", async () => {
    const state = await createContact({}, formWith({ name: "", birthday: "31.04" }));

    expect(state.errors).toEqual({ name: "Укажите имя", birthday: "Такой даты нет" });
    expect(await listContacts(owner.id)).toEqual([]);
  });
});
