import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import {
  addContactToGroup,
  createGroup,
  deleteGroup,
  listGroups,
  removeContactFromGroup,
  renameGroup,
} from "@/lib/groups";

import { countRows, link, makeContact, makeGroup, makeNote } from "../../test/factories";

describe("createGroup", () => {
  it("creates a group and returns it as typed", async () => {
    const result = await createGroup("Теннис");

    expect(result).toEqual({ ok: true, group: { id: expect.any(Number), name: "Теннис" } });
    const stored = await db.select().from(groups);
    expect(stored.map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("does not create a group whose name differs only in case", async () => {
    await makeGroup("Теннис");

    const result = await createGroup("теннис");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Теннис" });
    expect(await countRows(groups)).toBe(1);
  });

  it("treats Ё and Е as one letter", async () => {
    await makeGroup("Ёлка");

    const result = await createGroup("елка");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Ёлка" });
    expect(await countRows(groups)).toBe(1);
  });

  it("allows different names", async () => {
    await makeGroup("Теннис");

    const result = await createGroup("Йога");

    expect(result.ok).toBe(true);
    expect(await countRows(groups)).toBe(2);
  });

  it("keeps one group when two tabs create the same name at once", async () => {
    const results = await Promise.all([createGroup("Друзья"), createGroup("друзья")]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "exists")).toHaveLength(1);
    expect(await countRows(groups)).toBe(1);
  });
});

describe("listGroups", () => {
  it("returns nothing when there are no groups", async () => {
    expect(await listGroups()).toEqual([]);
  });

  it("sorts by name, ignoring case", async () => {
    await makeGroup("теннис");
    await makeGroup("Аналитики");
    await makeGroup("Друзья");

    const list = await listGroups();

    expect(list.map((group) => group.name)).toEqual(["Аналитики", "Друзья", "теннис"]);
  });

  it("puts Ё next to Е", async () => {
    await makeGroup("Жуки");
    await makeGroup("Ёлка");
    await makeGroup("Единомышленники");

    const list = await listGroups();

    expect(list.map((group) => group.name)).toEqual(["Единомышленники", "Ёлка", "Жуки"]);
  });

  it("counts the contacts of each group, 0 for an empty one", async () => {
    const tennis = await makeGroup("Теннис");
    const friends = await makeGroup("Друзья");
    await makeGroup("Йога");
    const ivan = await makeContact("Иван");
    const anna = await makeContact("Анна");
    const oleg = await makeContact("Олег");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);
    await link(oleg.id, tennis.id);
    await link(ivan.id, friends.id);

    const list = await listGroups();

    expect(list).toEqual([
      { id: friends.id, name: "Друзья", contactCount: 1 },
      { id: expect.any(Number), name: "Йога", contactCount: 0 },
      { id: tennis.id, name: "Теннис", contactCount: 3 },
    ]);
  });
});

describe("renameGroup", () => {
  it("gives the group a new name", async () => {
    const tennis = await makeGroup("Теннис");

    const result = await renameGroup(tennis.id, "Большой теннис");

    expect(result).toEqual({ ok: true, group: { id: tennis.id, name: "Большой теннис" } });
    expect((await listGroups()).map((group) => group.name)).toEqual(["Большой теннис"]);
  });

  it("does not rename into a name taken by another group, whatever the case", async () => {
    await makeGroup("Друзья");
    const tennis = await makeGroup("Теннис");

    const result = await renameGroup(tennis.id, "друзья");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Друзья" });
    expect((await listGroups()).map((group) => group.name)).toEqual(["Друзья", "Теннис"]);
  });

  it("treats Ё and Е as one letter when the name is taken", async () => {
    await makeGroup("Ёлка");
    const tennis = await makeGroup("Теннис");

    const result = await renameGroup(tennis.id, "елка");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Ёлка" });
  });

  it("lets a group change only the case of its own name", async () => {
    const tennis = await makeGroup("теннис");

    const result = await renameGroup(tennis.id, "Теннис");

    expect(result).toEqual({ ok: true, group: { id: tennis.id, name: "Теннис" } });
    expect((await listGroups()).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("says the group is not found when there is no such group", async () => {
    const tennis = await makeGroup("Теннис");

    const result = await renameGroup(tennis.id + 1000, "Йога");

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect((await listGroups()).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("keeps the contacts in the renamed group", async () => {
    const tennis = await makeGroup("Теннис");
    const ivan = await makeContact("Иван");
    const anna = await makeContact("Анна");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);

    await renameGroup(tennis.id, "Большой теннис");

    expect(await listGroups()).toEqual([{ id: tennis.id, name: "Большой теннис", contactCount: 2 }]);
    expect(await countRows(contactGroups)).toBe(2);
  });
});

async function groupIdsOf(contactId: number) {
  const rows = await db.select().from(contactGroups).where(eq(contactGroups.contactId, contactId));
  return rows.map((row) => row.groupId).sort((a, b) => a - b);
}

describe("deleteGroup", () => {
  it("deletes the group and its links, and leaves the contacts and their notes", async () => {
    const tennis = await makeGroup("Теннис");
    const ivan = await makeContact("Иван");
    const anna = await makeContact("Анна");
    await makeNote(ivan.id, "Договорились о матче");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);

    await deleteGroup(tennis.id);

    expect(await countRows(groups)).toBe(0);
    expect(await countRows(contactGroups)).toBe(0);
    expect(await countRows(contacts)).toBe(2);
    expect(await countRows(notes)).toBe(1);
  });

  it("leaves other groups and their links", async () => {
    const tennis = await makeGroup("Теннис");
    const friends = await makeGroup("Друзья");
    const ivan = await makeContact("Иван");
    await link(ivan.id, tennis.id);
    await link(ivan.id, friends.id);

    await deleteGroup(tennis.id);

    expect(await listGroups()).toEqual([{ id: friends.id, name: "Друзья", contactCount: 1 }]);
    expect(await groupIdsOf(ivan.id)).toEqual([friends.id]);
  });

  it("is not an error when the group is already gone", async () => {
    const tennis = await makeGroup("Теннис");

    await deleteGroup(tennis.id);

    await expect(deleteGroup(tennis.id)).resolves.not.toThrow();
  });
});

describe("addContactToGroup and removeContactFromGroup", () => {
  it("puts a contact into two groups at once", async () => {
    const friends = await makeGroup("Друзья");
    const analysts = await makeGroup("Аналитики");
    const ivan = await makeContact("Иван");

    expect(await addContactToGroup(ivan.id, friends.id)).toEqual({ ok: true });
    expect(await addContactToGroup(ivan.id, analysts.id)).toEqual({ ok: true });

    expect(await groupIdsOf(ivan.id)).toEqual([friends.id, analysts.id].sort((a, b) => a - b));
    expect((await listGroups()).map((group) => group.contactCount)).toEqual([1, 1]);
  });

  it("does not add a contact to the same group twice and does not fail", async () => {
    const tennis = await makeGroup("Теннис");
    const ivan = await makeContact("Иван");
    await addContactToGroup(ivan.id, tennis.id);

    const again = await addContactToGroup(ivan.id, tennis.id);

    expect(again).toEqual({ ok: true });
    expect(await countRows(contactGroups)).toBe(1);
  });

  it("removes a contact from a group and leaves the other groups", async () => {
    const tennis = await makeGroup("Теннис");
    const friends = await makeGroup("Друзья");
    const ivan = await makeContact("Иван");
    const anna = await makeContact("Анна");
    await link(ivan.id, tennis.id);
    await link(ivan.id, friends.id);
    await link(anna.id, tennis.id);

    await removeContactFromGroup(ivan.id, tennis.id);

    expect(await groupIdsOf(ivan.id)).toEqual([friends.id]);
    expect(await groupIdsOf(anna.id)).toEqual([tennis.id]);
    expect(await countRows(contacts)).toBe(2);
    expect(await countRows(groups)).toBe(2);
  });

  it("is not an error to remove a contact that is not in the group", async () => {
    const tennis = await makeGroup("Теннис");
    const ivan = await makeContact("Иван");

    await expect(removeContactFromGroup(ivan.id, tennis.id)).resolves.not.toThrow();
    await expect(removeContactFromGroup(ivan.id + 1000, tennis.id + 1000)).resolves.not.toThrow();
  });

  it("says not found when the contact does not exist", async () => {
    const tennis = await makeGroup("Теннис");

    expect(await addContactToGroup(9999, tennis.id)).toEqual({ ok: false, reason: "not-found" });
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("says not found when the group does not exist", async () => {
    const ivan = await makeContact("Иван");

    expect(await addContactToGroup(ivan.id, 9999)).toEqual({ ok: false, reason: "not-found" });
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("lowers the number in the group when a contact is deleted, and keeps the empty group", async () => {
    const tennis = await makeGroup("Теннис");
    const yoga = await makeGroup("Йога");
    const ivan = await makeContact("Иван");
    const anna = await makeContact("Анна");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);
    await link(anna.id, yoga.id);

    await db.delete(contacts).where(eq(contacts.id, anna.id));

    expect(await listGroups()).toEqual([
      { id: yoga.id, name: "Йога", contactCount: 0 },
      { id: tennis.id, name: "Теннис", contactCount: 1 },
    ]);
  });
});
