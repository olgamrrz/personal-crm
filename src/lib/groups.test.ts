import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, type User } from "@/db/schema";
import {
  addContactToGroup,
  createGroup,
  deleteGroup,
  listGroups,
  removeContactFromGroup,
  renameGroup,
} from "@/lib/groups";

import { countRows, link, makeContact, makeGroup, makeNote, makeUser } from "../../test/factories";

// Whose data the tests work with; the tests of other people's data make a second one
let owner: User;

beforeEach(async () => {
  owner = await makeUser();
});

describe("createGroup", () => {
  it("creates a group and returns it as typed", async () => {
    const result = await createGroup(owner.id, "Теннис");

    expect(result).toEqual({ ok: true, group: { id: expect.any(Number), name: "Теннис" } });
    const stored = await db.select().from(groups);
    expect(stored.map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("does not create a group whose name differs only in case", async () => {
    await makeGroup(owner.id, "Теннис");

    const result = await createGroup(owner.id, "теннис");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Теннис" });
    expect(await countRows(groups)).toBe(1);
  });

  it("treats Ё and Е as one letter", async () => {
    await makeGroup(owner.id, "Ёлка");

    const result = await createGroup(owner.id, "елка");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Ёлка" });
    expect(await countRows(groups)).toBe(1);
  });

  it("allows different names", async () => {
    await makeGroup(owner.id, "Теннис");

    const result = await createGroup(owner.id, "Йога");

    expect(result.ok).toBe(true);
    expect(await countRows(groups)).toBe(2);
  });

  it("keeps one group when two tabs create the same name at once", async () => {
    const results = await Promise.all([createGroup(owner.id, "Друзья"), createGroup(owner.id, "друзья")]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.reason === "exists")).toHaveLength(1);
    expect(await countRows(groups)).toBe(1);
  });
});

describe("listGroups", () => {
  it("returns nothing when there are no groups", async () => {
    expect(await listGroups(owner.id)).toEqual([]);
  });

  it("sorts by name, ignoring case", async () => {
    await makeGroup(owner.id, "теннис");
    await makeGroup(owner.id, "Аналитики");
    await makeGroup(owner.id, "Друзья");

    const list = await listGroups(owner.id);

    expect(list.map((group) => group.name)).toEqual(["Аналитики", "Друзья", "теннис"]);
  });

  it("puts Ё next to Е", async () => {
    await makeGroup(owner.id, "Жуки");
    await makeGroup(owner.id, "Ёлка");
    await makeGroup(owner.id, "Единомышленники");

    const list = await listGroups(owner.id);

    expect(list.map((group) => group.name)).toEqual(["Единомышленники", "Ёлка", "Жуки"]);
  });

  it("counts the contacts of each group, 0 for an empty one", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const friends = await makeGroup(owner.id, "Друзья");
    await makeGroup(owner.id, "Йога");
    const ivan = await makeContact(owner.id, "Иван");
    const anna = await makeContact(owner.id, "Анна");
    const oleg = await makeContact(owner.id, "Олег");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);
    await link(oleg.id, tennis.id);
    await link(ivan.id, friends.id);

    const list = await listGroups(owner.id);

    expect(list).toEqual([
      { id: friends.id, name: "Друзья", contactCount: 1 },
      { id: expect.any(Number), name: "Йога", contactCount: 0 },
      { id: tennis.id, name: "Теннис", contactCount: 3 },
    ]);
  });
});

describe("renameGroup", () => {
  it("gives the group a new name", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");

    const result = await renameGroup(owner.id, tennis.id, "Большой теннис");

    expect(result).toEqual({ ok: true, group: { id: tennis.id, name: "Большой теннис" } });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Большой теннис"]);
  });

  it("does not rename into a name taken by another group, whatever the case", async () => {
    await makeGroup(owner.id, "Друзья");
    const tennis = await makeGroup(owner.id, "Теннис");

    const result = await renameGroup(owner.id, tennis.id, "друзья");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Друзья" });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Друзья", "Теннис"]);
  });

  it("treats Ё and Е as one letter when the name is taken", async () => {
    await makeGroup(owner.id, "Ёлка");
    const tennis = await makeGroup(owner.id, "Теннис");

    const result = await renameGroup(owner.id, tennis.id, "елка");

    expect(result).toEqual({ ok: false, reason: "exists", existingName: "Ёлка" });
  });

  it("lets a group change only the case of its own name", async () => {
    const tennis = await makeGroup(owner.id, "теннис");

    const result = await renameGroup(owner.id, tennis.id, "Теннис");

    expect(result).toEqual({ ok: true, group: { id: tennis.id, name: "Теннис" } });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("says the group is not found when there is no such group", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");

    const result = await renameGroup(owner.id, tennis.id + 1000, "Йога");

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Теннис"]);
  });

  it("keeps the contacts in the renamed group", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const ivan = await makeContact(owner.id, "Иван");
    const anna = await makeContact(owner.id, "Анна");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);

    await renameGroup(owner.id, tennis.id, "Большой теннис");

    expect(await listGroups(owner.id)).toEqual([{ id: tennis.id, name: "Большой теннис", contactCount: 2 }]);
    expect(await countRows(contactGroups)).toBe(2);
  });
});

async function groupIdsOf(contactId: number) {
  const rows = await db.select().from(contactGroups).where(eq(contactGroups.contactId, contactId));
  return rows.map((row) => row.groupId).sort((a, b) => a - b);
}

describe("deleteGroup", () => {
  it("deletes the group and its links, and leaves the contacts and their notes", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const ivan = await makeContact(owner.id, "Иван");
    const anna = await makeContact(owner.id, "Анна");
    await makeNote(ivan.id, "Договорились о матче");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);

    await deleteGroup(owner.id, tennis.id);

    expect(await countRows(groups)).toBe(0);
    expect(await countRows(contactGroups)).toBe(0);
    expect(await countRows(contacts)).toBe(2);
    expect(await countRows(notes)).toBe(1);
  });

  it("leaves other groups and their links", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const friends = await makeGroup(owner.id, "Друзья");
    const ivan = await makeContact(owner.id, "Иван");
    await link(ivan.id, tennis.id);
    await link(ivan.id, friends.id);

    await deleteGroup(owner.id, tennis.id);

    expect(await listGroups(owner.id)).toEqual([{ id: friends.id, name: "Друзья", contactCount: 1 }]);
    expect(await groupIdsOf(ivan.id)).toEqual([friends.id]);
  });

  it("is not an error when the group is already gone", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");

    await deleteGroup(owner.id, tennis.id);

    await expect(deleteGroup(owner.id, tennis.id)).resolves.not.toThrow();
  });
});

describe("addContactToGroup and removeContactFromGroup", () => {
  it("puts a contact into two groups at once", async () => {
    const friends = await makeGroup(owner.id, "Друзья");
    const analysts = await makeGroup(owner.id, "Аналитики");
    const ivan = await makeContact(owner.id, "Иван");

    expect(await addContactToGroup(owner.id, ivan.id, friends.id)).toEqual({ ok: true });
    expect(await addContactToGroup(owner.id, ivan.id, analysts.id)).toEqual({ ok: true });

    expect(await groupIdsOf(ivan.id)).toEqual([friends.id, analysts.id].sort((a, b) => a - b));
    expect((await listGroups(owner.id)).map((group) => group.contactCount)).toEqual([1, 1]);
  });

  it("does not add a contact to the same group twice and does not fail", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const ivan = await makeContact(owner.id, "Иван");
    await addContactToGroup(owner.id, ivan.id, tennis.id);

    const again = await addContactToGroup(owner.id, ivan.id, tennis.id);

    expect(again).toEqual({ ok: true });
    expect(await countRows(contactGroups)).toBe(1);
  });

  it("removes a contact from a group and leaves the other groups", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const friends = await makeGroup(owner.id, "Друзья");
    const ivan = await makeContact(owner.id, "Иван");
    const anna = await makeContact(owner.id, "Анна");
    await link(ivan.id, tennis.id);
    await link(ivan.id, friends.id);
    await link(anna.id, tennis.id);

    await removeContactFromGroup(owner.id, ivan.id, tennis.id);

    expect(await groupIdsOf(ivan.id)).toEqual([friends.id]);
    expect(await groupIdsOf(anna.id)).toEqual([tennis.id]);
    expect(await countRows(contacts)).toBe(2);
    expect(await countRows(groups)).toBe(2);
  });

  it("is not an error to remove a contact that is not in the group", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const ivan = await makeContact(owner.id, "Иван");

    await expect(removeContactFromGroup(owner.id, ivan.id, tennis.id)).resolves.not.toThrow();
    await expect(removeContactFromGroup(owner.id, ivan.id + 1000, tennis.id + 1000)).resolves.not.toThrow();
  });

  it("says not found when the contact does not exist", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");

    expect(await addContactToGroup(owner.id, 9999, tennis.id)).toEqual({ ok: false, reason: "not-found" });
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("says not found when the group does not exist", async () => {
    const ivan = await makeContact(owner.id, "Иван");

    expect(await addContactToGroup(owner.id, ivan.id, 9999)).toEqual({ ok: false, reason: "not-found" });
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("lowers the number in the group when a contact is deleted, and keeps the empty group", async () => {
    const tennis = await makeGroup(owner.id, "Теннис");
    const yoga = await makeGroup(owner.id, "Йога");
    const ivan = await makeContact(owner.id, "Иван");
    const anna = await makeContact(owner.id, "Анна");
    await link(ivan.id, tennis.id);
    await link(anna.id, tennis.id);
    await link(anna.id, yoga.id);

    await db.delete(contacts).where(eq(contacts.id, anna.id));

    expect(await listGroups(owner.id)).toEqual([
      { id: yoga.id, name: "Йога", contactCount: 0 },
      { id: tennis.id, name: "Теннис", contactCount: 1 },
    ]);
  });
});

// The owner above is A; B is somebody else (openspec/changes/login/specs/data-ownership and contact-groups)
describe("other people's groups", () => {
  let other: User;

  beforeEach(async () => {
    other = await makeUser();
  });

  it("an own group is in the list of its owner only", async () => {
    await createGroup(owner.id, "Теннис");

    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Теннис"]);
    expect(await listGroups(other.id)).toEqual([]);
  });

  it("each person can have their own «Друзья»", async () => {
    await createGroup(owner.id, "Друзья");

    const result = await createGroup(other.id, "друзья");

    expect(result).toMatchObject({ ok: true, group: { name: "друзья" } });
    expect((await listGroups(owner.id)).map((group) => group.name)).toEqual(["Друзья"]);
    expect((await listGroups(other.id)).map((group) => group.name)).toEqual(["друзья"]);
  });

  it("a person still cannot have two groups of the same name", async () => {
    await createGroup(owner.id, "Друзья");
    await createGroup(other.id, "Друзья");

    expect(await createGroup(owner.id, "друзья")).toEqual({
      ok: false,
      reason: "exists",
      existingName: "Друзья",
    });
    expect(await createGroup(other.id, "ДРУЗЬЯ")).toEqual({
      ok: false,
      reason: "exists",
      existingName: "Друзья",
    });
  });

  it("a group can be renamed to a name that only somebody else has", async () => {
    await createGroup(owner.id, "Друзья");
    const tennis = await createGroup(other.id, "Теннис");
    if (!tennis.ok) throw new Error("setup failed");

    expect(await renameGroup(other.id, tennis.group.id, "друзья")).toMatchObject({ ok: true });
  });

  it("somebody else's group is not renamed, as if it did not exist", async () => {
    const group = await makeGroup(owner.id, "Теннис");

    expect(await renameGroup(other.id, group.id, "Хакнуто")).toEqual({ ok: false, reason: "not-found" });
    expect(await renameGroup(other.id, 9999, "Хакнуто")).toEqual({ ok: false, reason: "not-found" });

    const [row] = await db.select().from(groups).where(eq(groups.id, group.id));
    expect(row.name).toBe("Теннис");
  });

  it("somebody else's group is not deleted, and its links stay", async () => {
    const group = await makeGroup(owner.id, "Теннис");
    const maria = await makeContact(owner.id, "Мария");
    await link(maria.id, group.id);

    await deleteGroup(other.id, group.id);

    expect(await countRows(groups)).toBe(1);
    expect(await countRows(contactGroups)).toBe(1);
  });

  it("an own contact cannot be put into somebody else's group", async () => {
    const theirs = await makeGroup(owner.id, "Теннис");
    const borisOwn = await makeContact(other.id, "Борис");

    expect(await addContactToGroup(other.id, borisOwn.id, theirs.id)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("somebody else's contact cannot be put into an own group", async () => {
    const mine = await makeGroup(other.id, "Свои");
    const maria = await makeContact(owner.id, "Мария");

    expect(await addContactToGroup(other.id, maria.id, mine.id)).toEqual({ ok: false, reason: "not-found" });
    expect(await countRows(contactGroups)).toBe(0);
  });

  it("somebody else's contact is not taken out of its group", async () => {
    const group = await makeGroup(owner.id, "Теннис");
    const maria = await makeContact(owner.id, "Мария");
    await link(maria.id, group.id);

    await removeContactFromGroup(other.id, maria.id, group.id);

    expect(await countRows(contactGroups)).toBe(1);
  });

  it("the numbers on the groups page count the owner's contacts of the owner's groups", async () => {
    const mine = await makeGroup(owner.id, "Теннис");
    const theirs = await makeGroup(other.id, "Теннис");
    for (const name of ["Анна", "Борис"]) await link((await makeContact(owner.id, name)).id, mine.id);
    await link((await makeContact(other.id, "Вера")).id, theirs.id);

    expect(await listGroups(owner.id)).toEqual([{ id: mine.id, name: "Теннис", contactCount: 2 }]);
    expect(await listGroups(other.id)).toEqual([{ id: theirs.id, name: "Теннис", contactCount: 1 }]);
  });
});
