import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, type User } from "@/db/schema";
import {
  addNote,
  deleteContact,
  getContact,
  getContactGroupIds,
  getLastContact,
  insertContact,
  listContacts,
  listNotes,
  listOverdueContacts,
  recordConversation,
  updateContactFrequency,
} from "@/lib/contacts";

import { countRows, link, makeContact, makeGroup, makeNote, makeUser } from "../../test/factories";

// Whose data the tests work with; the tests of other people's data make a second one
let owner: User;

beforeEach(async () => {
  owner = await makeUser();
});

const names = (list: { name: string }[]) => list.map((contact) => contact.name);

describe("listContacts", () => {
  describe("without a group", () => {
    it("sorts by name, ignoring case, with Ё next to Е", async () => {
      await makeContact(owner.id, "Борис");
      await makeContact(owner.id, "ёлкин Артём");
      await makeContact(owner.id, "Анна");
      await makeContact(owner.id, "Егор");

      expect(names(await listContacts(owner.id))).toEqual(["Анна", "Борис", "Егор", "ёлкин Артём"]);
    });

    it("finds Алёна by Алена and the other way round", async () => {
      await makeContact(owner.id, "Алёна Смирнова");
      await makeContact(owner.id, "Иван Петров");

      expect(names(await listContacts(owner.id, "Алена"))).toEqual(["Алёна Смирнова"]);
      expect(names(await listContacts(owner.id, "алёна"))).toEqual(["Алёна Смирнова"]);
    });

    it("finds a part of a name, in any case", async () => {
      await makeContact(owner.id, "Иван Петров");
      await makeContact(owner.id, "Анна Иванова");
      await makeContact(owner.id, "Олег");

      expect(names(await listContacts(owner.id, "ИВАН"))).toEqual(["Анна Иванова", "Иван Петров"]);
    });

    it("takes % and _ in the search as plain characters", async () => {
      await makeContact(owner.id, "Иван Петров");
      await makeContact(owner.id, "100% надёжный");

      expect(names(await listContacts(owner.id, "%"))).toEqual(["100% надёжный"]);
      expect(names(await listContacts(owner.id, "_"))).toEqual([]);
    });

    it("gives every contact the ids of their groups, and an empty list when there are none", async () => {
      const friends = await makeGroup(owner.id, "Друзья");
      const tennis = await makeGroup(owner.id, "Теннис");
      const ivan = await makeContact(owner.id, "Иван");
      await makeContact(owner.id, "Олег");
      await link(ivan.id, tennis.id);
      await link(ivan.id, friends.id);

      const list = await listContacts(owner.id);

      expect(list.find((contact) => contact.name === "Иван")?.groupIds).toEqual(
        [friends.id, tennis.id].sort((a, b) => a - b),
      );
      expect(list.find((contact) => contact.name === "Олег")?.groupIds).toEqual([]);
    });
  });

  describe("with a group", () => {
    it("returns only the contacts of that group", async () => {
      const tennis = await makeGroup(owner.id, "Теннис");
      const friends = await makeGroup(owner.id, "Друзья");
      const ivan = await makeContact(owner.id, "Иван");
      const anna = await makeContact(owner.id, "Анна");
      await makeContact(owner.id, "Олег");
      await link(ivan.id, tennis.id);
      await link(anna.id, friends.id);

      expect(names(await listContacts(owner.id, "", tennis.id))).toEqual(["Иван"]);
      expect(names(await listContacts(owner.id, "", friends.id))).toEqual(["Анна"]);
    });

    it("keeps all the groups of a contact, not only the chosen one", async () => {
      const tennis = await makeGroup(owner.id, "Теннис");
      const friends = await makeGroup(owner.id, "Друзья");
      const ivan = await makeContact(owner.id, "Иван");
      await link(ivan.id, tennis.id);
      await link(ivan.id, friends.id);

      const [found] = await listContacts(owner.id, "", tennis.id);

      expect(found.groupIds).toEqual([friends.id, tennis.id].sort((a, b) => a - b));
    });

    it("works together with the search", async () => {
      const tennis = await makeGroup(owner.id, "Теннис");
      const ivanP = await makeContact(owner.id, "Иван Петров");
      const anna = await makeContact(owner.id, "Анна");
      await makeContact(owner.id, "Иван Сидоров");
      await link(ivanP.id, tennis.id);
      await link(anna.id, tennis.id);

      expect(names(await listContacts(owner.id, "иван", tennis.id))).toEqual(["Иван Петров"]);
      expect(names(await listContacts(owner.id, "зоя", tennis.id))).toEqual([]);
    });

    it("sorts by name like the full list", async () => {
      const tennis = await makeGroup(owner.id, "Теннис");
      for (const name of ["Яна", "Борис", "Анна"]) {
        await link((await makeContact(owner.id, name)).id, tennis.id);
      }

      expect(names(await listContacts(owner.id, "", tennis.id))).toEqual(["Анна", "Борис", "Яна"]);
    });

    it("returns nobody for a group that exists but is empty", async () => {
      const yoga = await makeGroup(owner.id, "Йога");
      await makeContact(owner.id, "Иван");

      expect(await listContacts(owner.id, "", yoga.id)).toEqual([]);
    });

    it("returns all the contacts when the group was deleted", async () => {
      const tennis = await makeGroup(owner.id, "Теннис");
      const ivan = await makeContact(owner.id, "Иван");
      await makeContact(owner.id, "Анна");
      await link(ivan.id, tennis.id);
      await db.delete(groups).where(eq(groups.id, tennis.id));

      expect(names(await listContacts(owner.id, "", tennis.id))).toEqual(["Анна", "Иван"]);
      expect(names(await listContacts(owner.id, "анна", tennis.id))).toEqual(["Анна"]);
    });
  });
});

describe("insertContact", () => {
  const ivan = { name: "Иван Петров", about: "тренер", howWeMet: null, phone: null, email: null };

  it("saves the contact with its fields and returns its id", async () => {
    const created = await insertContact(owner.id, ivan, []);

    const [stored] = await db.select().from(contacts);
    expect(stored).toMatchObject({ id: created.id, name: "Иван Петров", about: "тренер" });
  });

  it("saves the contact without links when no groups are given", async () => {
    await insertContact(owner.id, ivan, []);

    expect(await countRows(contacts)).toBe(1);
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("saves the contact together with its groups", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const friends = await makeGroup(owner.id, "Друзья");

    const created = await insertContact(owner.id, ivan, [tennis.id, friends.id]);

    expect(await getContactGroupIds(owner.id, created.id)).toEqual(
      [tennis.id, friends.id].sort((a, b) => a - b),
    );
  });

  it("does not mind the same group given twice", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");

    const created = await insertContact(owner.id, ivan, [tennis.id, tennis.id]);

    expect(await getContactGroupIds(owner.id, created.id)).toEqual([tennis.id]);
  });

  it("skips a group deleted in the meantime and still saves the contact", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const friends = await makeGroup(owner.id, "Друзья");
    await db.delete(groups).where(eq(groups.id, tennis.id));

    const created = await insertContact(owner.id, ivan, [tennis.id, friends.id]);

    expect(await countRows(contacts)).toBe(1);
    expect(await getContactGroupIds(owner.id, created.id)).toEqual([friends.id]);
  });

  it("saves a contact whose only group was deleted, without groups", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    await db.delete(groups).where(eq(groups.id, tennis.id));

    const created = await insertContact(owner.id, ivan, [tennis.id]);

    expect(await countRows(contacts)).toBe(1);
    expect(await getContactGroupIds(owner.id, created.id)).toEqual([]);
  });

  it("saves nothing at all when the links cannot be written", async () => {
    // An id that does not fit into the integer column makes the second statement fail
    await expect(insertContact(owner.id, ivan, [99_999_999_999])).rejects.toThrow();

    expect(await countRows(contacts)).toBe(0);
    expect(await countRows(contactGroups)).toBe(0);
  });
});

describe("getContactGroupIds", () => {
  it("returns the ids of the groups of the contact", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const friends = await makeGroup(owner.id, "Друзья");
    await makeGroup(owner.id, "Йога");
    const ivan = await makeContact(owner.id, "Иван");
    const anna = await makeContact(owner.id, "Анна");
    await link(ivan.id, tennis.id);
    await link(ivan.id, friends.id);
    await link(anna.id, tennis.id);

    expect(await getContactGroupIds(owner.id, ivan.id)).toEqual(
      [tennis.id, friends.id].sort((a, b) => a - b),
    );
    expect(await getContactGroupIds(owner.id, anna.id)).toEqual([tennis.id]);
  });

  it("returns an empty list for a contact without groups", async () => {
    await makeGroup(owner.id, "Теннис");
    const ivan = await makeContact(owner.id, "Иван");
    await makeNote(ivan.id);

    expect(await getContactGroupIds(owner.id, ivan.id)).toEqual([]);
    expect(await countRows(notes)).toBe(1);
  });

  it("returns an empty list for a contact that does not exist", async () => {
    expect(await getContactGroupIds(owner.id, 9999)).toEqual([]);
  });
});

// The owner above is A; B is somebody else. Nothing of A shows for B (openspec/changes/login/specs/data-ownership).
describe("other people's data when reading", () => {
  let other: User;

  beforeEach(async () => {
    other = await makeUser();
  });

  it("the list has only own contacts", async () => {
    await makeContact(owner.id, "Мария Соколова");
    await makeContact(other.id, "Борис Иванов");

    expect(names(await listContacts(owner.id))).toEqual(["Мария Соколова"]);
    expect(names(await listContacts(other.id))).toEqual(["Борис Иванов"]);
  });

  it("the count of contacts is own: 3 for A and 1 for B", async () => {
    for (const name of ["Анна", "Борис", "Вера"]) await makeContact(owner.id, name);
    await makeContact(other.id, "Глеб");

    expect(await listContacts(owner.id)).toHaveLength(3);
    expect(await listContacts(other.id)).toHaveLength(1);
  });

  it("another person's contact is not found by search", async () => {
    await makeContact(owner.id, "Мария Соколова");

    expect(await listContacts(other.id, "Соколова")).toEqual([]);
    expect(names(await listContacts(owner.id, "Соколова"))).toEqual(["Мария Соколова"]);
  });

  it("another person's contact is not found by id: the card, notes and groups are empty", async () => {
    const group = await makeGroup(owner.id, "Теннис");
    const maria = await makeContact(owner.id, "Мария Соколова");
    await makeNote(maria.id, "Секретная заметка");
    await link(maria.id, group.id);

    expect(await getContact(other.id, maria.id)).toBeNull();
    expect(await listNotes(other.id, maria.id)).toEqual([]);
    expect(await getContactGroupIds(other.id, maria.id)).toEqual([]);
    expect(await getLastContact(other.id, maria.id)).toBeNull();
    // and A still sees it all
    expect(await getContact(owner.id, maria.id)).toMatchObject({ name: "Мария Соколова" });
    expect(await listNotes(owner.id, maria.id)).toHaveLength(1);
    expect(await getContactGroupIds(owner.id, maria.id)).toEqual([group.id]);
  });

  it("the block «Пора связаться» has only own contacts", async () => {
    const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60_000);
    await makeContact(owner.id, "Мария Соколова", {
      contactFrequency: "month",
      contactFrequencySetAt: longAgo,
    });

    expect(await listOverdueContacts(other.id)).toEqual([]);
    expect(await listOverdueContacts(owner.id)).toHaveLength(1);
  });

  it("a filter by another person's group is a filter by a group that does not exist", async () => {
    const theirGroup = await makeGroup(owner.id, "Теннис");
    const maria = await makeContact(owner.id, "Мария Соколова");
    await link(maria.id, theirGroup.id);
    await makeContact(other.id, "Борис Иванов");

    // For B the group is unknown, so nobody is filtered out, as for an old link to a deleted group
    expect(names(await listContacts(other.id, "", theirGroup.id))).toEqual(["Борис Иванов"]);
  });
});

describe("addNote", () => {
  it("adds a note to an own contact", async () => {
    const maria = await makeContact(owner.id, "Мария Соколова");

    expect(await addNote(owner.id, maria.id, "Договорились о встрече")).toBe(true);

    expect((await listNotes(owner.id, maria.id)).map((note) => note.body)).toEqual([
      "Договорились о встрече",
    ]);
  });

  it("says «not found» for a contact that does not exist, and adds nothing", async () => {
    expect(await addNote(owner.id, 9999, "Заметка")).toBe(false);
    expect(await countRows(notes)).toBe(0);
  });
});

describe("other people's data when writing", () => {
  let other: User;

  beforeEach(async () => {
    other = await makeUser();
  });

  it("a note to somebody else's contact is refused as for a contact that does not exist", async () => {
    const maria = await makeContact(owner.id, "Мария Соколова");

    expect(await addNote(other.id, maria.id, "Чужая заметка")).toBe(await addNote(other.id, 9999, "Заметка"));
    expect(await addNote(other.id, maria.id, "Чужая заметка")).toBe(false);
    expect(await countRows(notes)).toBe(0);
  });

  it("somebody else's contact is not deleted, and its notes stay", async () => {
    const maria = await makeContact(owner.id, "Мария Соколова");
    await makeNote(maria.id);

    await deleteContact(other.id, maria.id);

    expect(await countRows(contacts)).toBe(1);
    expect(await countRows(notes)).toBe(1);
  });

  it("an own contact is deleted together with its notes and links", async () => {
    const group = await makeGroup(owner.id, "Теннис");
    const maria = await makeContact(owner.id, "Мария Соколова");
    await makeNote(maria.id);
    await link(maria.id, group.id);

    await deleteContact(owner.id, maria.id);

    expect(await countRows(contacts)).toBe(0);
    expect(await countRows(notes)).toBe(0);
    expect(await countRows(contactGroups)).toBe(0);
    expect(await countRows(groups)).toBe(1);
  });

  it("deleting a contact that is already gone is not an error", async () => {
    await expect(deleteContact(owner.id, 9999)).resolves.toBeUndefined();
  });

  it("the frequency of somebody else's contact is not changed", async () => {
    const maria = await makeContact(owner.id, "Мария Соколова");

    expect(await updateContactFrequency(other.id, maria.id, "week")).toBe(false);

    const [row] = await db.select().from(contacts).where(eq(contacts.id, maria.id));
    expect(row.contactFrequency).toBeNull();
    expect(row.contactFrequencySetAt).toBeNull();
  });

  it("«Пообщались» for somebody else's contact changes nothing", async () => {
    const maria = await makeContact(owner.id, "Мария Соколова");

    expect(await recordConversation(other.id, maria.id)).toBe(false);

    const [row] = await db.select().from(contacts).where(eq(contacts.id, maria.id));
    expect(row.lastContactedAt).toBeNull();
  });

  it("a new contact gets its owner, and a group of somebody else is left out", async () => {
    const mine = await makeGroup(other.id, "Свои");
    const theirs = await makeGroup(owner.id, "Чужая");

    const created = await insertContact(
      other.id,
      { name: "Борис Иванов", about: null, howWeMet: null, phone: null, email: null },
      [mine.id, theirs.id],
    );

    const [row] = await db.select().from(contacts).where(eq(contacts.id, created.id));
    expect(row.ownerId).toBe(other.id);
    expect(await getContactGroupIds(other.id, created.id)).toEqual([mine.id]);
    expect(await countRows(contactGroups)).toBe(1);
  });
});
