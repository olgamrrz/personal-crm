import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { getContactGroupIds, insertContact, listContacts } from "@/lib/contacts";

import { countRows, link, makeContact, makeGroup, makeNote } from "../../test/factories";

const names = (list: { name: string }[]) => list.map((contact) => contact.name);

describe("listContacts", () => {
  describe("without a group", () => {
    it("sorts by name, ignoring case, with Ё next to Е", async () => {
      await makeContact("Борис");
      await makeContact("ёлкин Артём");
      await makeContact("Анна");
      await makeContact("Егор");

      expect(names(await listContacts())).toEqual(["Анна", "Борис", "Егор", "ёлкин Артём"]);
    });

    it("finds Алёна by Алена and the other way round", async () => {
      await makeContact("Алёна Смирнова");
      await makeContact("Иван Петров");

      expect(names(await listContacts("Алена"))).toEqual(["Алёна Смирнова"]);
      expect(names(await listContacts("алёна"))).toEqual(["Алёна Смирнова"]);
    });

    it("finds a part of a name, in any case", async () => {
      await makeContact("Иван Петров");
      await makeContact("Анна Иванова");
      await makeContact("Олег");

      expect(names(await listContacts("ИВАН"))).toEqual(["Анна Иванова", "Иван Петров"]);
    });

    it("takes % and _ in the search as plain characters", async () => {
      await makeContact("Иван Петров");
      await makeContact("100% надёжный");

      expect(names(await listContacts("%"))).toEqual(["100% надёжный"]);
      expect(names(await listContacts("_"))).toEqual([]);
    });

    it("gives every contact the ids of their groups, and an empty list when there are none", async () => {
      const friends = await makeGroup("Друзья");
      const tennis = await makeGroup("Теннис");
      const ivan = await makeContact("Иван");
      await makeContact("Олег");
      await link(ivan.id, tennis.id);
      await link(ivan.id, friends.id);

      const list = await listContacts();

      expect(list.find((contact) => contact.name === "Иван")?.groupIds).toEqual(
        [friends.id, tennis.id].sort((a, b) => a - b),
      );
      expect(list.find((contact) => contact.name === "Олег")?.groupIds).toEqual([]);
    });
  });

  describe("with a group", () => {
    it("returns only the contacts of that group", async () => {
      const tennis = await makeGroup("Теннис");
      const friends = await makeGroup("Друзья");
      const ivan = await makeContact("Иван");
      const anna = await makeContact("Анна");
      await makeContact("Олег");
      await link(ivan.id, tennis.id);
      await link(anna.id, friends.id);

      expect(names(await listContacts("", tennis.id))).toEqual(["Иван"]);
      expect(names(await listContacts("", friends.id))).toEqual(["Анна"]);
    });

    it("keeps all the groups of a contact, not only the chosen one", async () => {
      const tennis = await makeGroup("Теннис");
      const friends = await makeGroup("Друзья");
      const ivan = await makeContact("Иван");
      await link(ivan.id, tennis.id);
      await link(ivan.id, friends.id);

      const [found] = await listContacts("", tennis.id);

      expect(found.groupIds).toEqual([friends.id, tennis.id].sort((a, b) => a - b));
    });

    it("works together with the search", async () => {
      const tennis = await makeGroup("Теннис");
      const ivanP = await makeContact("Иван Петров");
      const anna = await makeContact("Анна");
      await makeContact("Иван Сидоров");
      await link(ivanP.id, tennis.id);
      await link(anna.id, tennis.id);

      expect(names(await listContacts("иван", tennis.id))).toEqual(["Иван Петров"]);
      expect(names(await listContacts("зоя", tennis.id))).toEqual([]);
    });

    it("sorts by name like the full list", async () => {
      const tennis = await makeGroup("Теннис");
      for (const name of ["Яна", "Борис", "Анна"]) {
        await link((await makeContact(name)).id, tennis.id);
      }

      expect(names(await listContacts("", tennis.id))).toEqual(["Анна", "Борис", "Яна"]);
    });

    it("returns nobody for a group that exists but is empty", async () => {
      const yoga = await makeGroup("Йога");
      await makeContact("Иван");

      expect(await listContacts("", yoga.id)).toEqual([]);
    });

    it("returns all the contacts when the group was deleted", async () => {
      const tennis = await makeGroup("Теннис");
      const ivan = await makeContact("Иван");
      await makeContact("Анна");
      await link(ivan.id, tennis.id);
      await db.delete(groups).where(eq(groups.id, tennis.id));

      expect(names(await listContacts("", tennis.id))).toEqual(["Анна", "Иван"]);
      expect(names(await listContacts("анна", tennis.id))).toEqual(["Анна"]);
    });
  });
});

describe("insertContact", () => {
  const ivan = { name: "Иван Петров", about: "тренер", howWeMet: null, phone: null, email: null };

  it("saves the contact with its fields and returns its id", async () => {
    const created = await insertContact(ivan, []);

    const [stored] = await db.select().from(contacts);
    expect(stored).toMatchObject({ id: created.id, name: "Иван Петров", about: "тренер" });
  });

  it("saves the contact without links when no groups are given", async () => {
    await insertContact(ivan, []);

    expect(await countRows(contacts)).toBe(1);
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("saves the contact together with its groups", async () => {
    const tennis = await makeGroup("Теннис");
    const friends = await makeGroup("Друзья");

    const created = await insertContact(ivan, [tennis.id, friends.id]);

    expect(await getContactGroupIds(created.id)).toEqual([tennis.id, friends.id].sort((a, b) => a - b));
  });

  it("does not mind the same group given twice", async () => {
    const tennis = await makeGroup("Теннис");

    const created = await insertContact(ivan, [tennis.id, tennis.id]);

    expect(await getContactGroupIds(created.id)).toEqual([tennis.id]);
  });

  it("skips a group deleted in the meantime and still saves the contact", async () => {
    const tennis = await makeGroup("Теннис");
    const friends = await makeGroup("Друзья");
    await db.delete(groups).where(eq(groups.id, tennis.id));

    const created = await insertContact(ivan, [tennis.id, friends.id]);

    expect(await countRows(contacts)).toBe(1);
    expect(await getContactGroupIds(created.id)).toEqual([friends.id]);
  });

  it("saves a contact whose only group was deleted, without groups", async () => {
    const tennis = await makeGroup("Теннис");
    await db.delete(groups).where(eq(groups.id, tennis.id));

    const created = await insertContact(ivan, [tennis.id]);

    expect(await countRows(contacts)).toBe(1);
    expect(await getContactGroupIds(created.id)).toEqual([]);
  });

  it("saves nothing at all when the links cannot be written", async () => {
    // An id that does not fit into the integer column makes the second statement fail
    await expect(insertContact(ivan, [99_999_999_999])).rejects.toThrow();

    expect(await countRows(contacts)).toBe(0);
    expect(await countRows(contactGroups)).toBe(0);
  });
});

describe("getContactGroupIds", () => {
  it("returns the ids of the groups of the contact", async () => {
    const tennis = await makeGroup("Теннис");
    const friends = await makeGroup("Друзья");
    await makeGroup("Йога");
    const ivan = await makeContact("Иван");
    const anna = await makeContact("Анна");
    await link(ivan.id, tennis.id);
    await link(ivan.id, friends.id);
    await link(anna.id, tennis.id);

    expect(await getContactGroupIds(ivan.id)).toEqual([tennis.id, friends.id].sort((a, b) => a - b));
    expect(await getContactGroupIds(anna.id)).toEqual([tennis.id]);
  });

  it("returns an empty list for a contact without groups", async () => {
    await makeGroup("Теннис");
    const ivan = await makeContact("Иван");
    await makeNote(ivan.id);

    expect(await getContactGroupIds(ivan.id)).toEqual([]);
    expect(await countRows(notes)).toBe(1);
  });

  it("returns an empty list for a contact that does not exist", async () => {
    expect(await getContactGroupIds(9999)).toEqual([]);
  });
});
