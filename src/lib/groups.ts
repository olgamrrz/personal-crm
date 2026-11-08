import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, contacts, groupNameKeySql, groups } from "@/db/schema";

// Sort names the way a Russian reader expects (case-insensitive, Ё next to Е)
const nameOrder = sql`${groups.name} collate "ru-RU-x-icu"`;

export type GroupSummary = { id: number; name: string };

export type GroupListItem = Awaited<ReturnType<typeof listGroups>>[number];

// The database has the last word on duplicate names: the unique index rejects them, even from two tabs at once.
// "exists" carries the name of the group that already has this name, for the message to the user.
export type GroupWriteResult =
  | { ok: true; group: GroupSummary }
  | { ok: false; reason: "exists"; existingName: string }
  | { ok: false; reason: "not-found" };

const UNIQUE_VIOLATION = "23505";

// Drizzle wraps the driver error, so the Postgres code can sit one level down
function postgresErrorCode(error: unknown): string | undefined {
  let current = error;
  while (current instanceof Error) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = current.cause;
  }
  return undefined;
}

// Names are compared within the groups of one owner: two people may both have «Друзья»
async function findGroupByName(ownerId: string, name: string) {
  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.ownerId, ownerId),
        sql`${groupNameKeySql(groups.name)} = ${groupNameKeySql(sql`${name}::text`)}`,
      ),
    );
  return group;
}

// `name` is already checked by the caller (parseGroupName): not empty, trimmed, not too long
export async function createGroup(ownerId: string, name: string): Promise<GroupWriteResult> {
  try {
    const [group] = await db
      .insert(groups)
      .values({ ownerId, name })
      .returning({ id: groups.id, name: groups.name });
    return { ok: true, group };
  } catch (error) {
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      const existing = await findGroupByName(ownerId, name);
      if (existing) return { ok: false, reason: "exists", existingName: existing.name };
    }
    throw error;
  }
}

// `name` is already checked by the caller. Renaming a group to its own name in another case is the same
// row for the unique index, so it is not a duplicate.
export async function renameGroup(ownerId: string, id: number, name: string): Promise<GroupWriteResult> {
  try {
    const [group] = await db
      .update(groups)
      .set({ name })
      .where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)))
      .returning({ id: groups.id, name: groups.name });
    return group ? { ok: true, group } : { ok: false, reason: "not-found" };
  } catch (error) {
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      const existing = await findGroupByName(ownerId, name);
      if (existing) return { ok: false, reason: "exists", existingName: existing.name };
    }
    throw error;
  }
}

// The links of the group go with it (cascade); the contacts and their notes stay.
// A group already deleted in another tab is gone either way, and somebody else's group is left alone:
// neither is an error.
export async function deleteGroup(ownerId: string, id: number) {
  await db.delete(groups).where(and(eq(groups.id, id), eq(groups.ownerId, ownerId)));
}

const FOREIGN_KEY_VIOLATION = "23503";

// Adding twice changes nothing. A contact or a group deleted in the meantime is "not found", and so is a contact
// or a group of somebody else: both must be the owner's.
export async function addContactToGroup(
  ownerId: string,
  contactId: number,
  groupId: number,
): Promise<{ ok: true } | { ok: false; reason: "not-found" }> {
  const [both] = await db
    .select({ contactId: contacts.id })
    .from(contacts)
    .innerJoin(groups, and(eq(groups.id, groupId), eq(groups.ownerId, ownerId)))
    .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)));
  if (!both) {
    return { ok: false, reason: "not-found" };
  }

  try {
    await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();
    return { ok: true };
  } catch (error) {
    // Deleted between the check and the insert
    if (postgresErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return { ok: false, reason: "not-found" };
    }
    throw error;
  }
}

// Removing a link that is not there is not an error: the contact is out of the group either way.
// A link of somebody else's contact is not touched.
export async function removeContactFromGroup(ownerId: string, contactId: number, groupId: number) {
  await db
    .delete(contactGroups)
    .where(
      and(
        eq(contactGroups.contactId, contactId),
        eq(contactGroups.groupId, groupId),
        sql`exists (select 1 from ${contacts} where ${contacts.id} = ${contactId} and ${contacts.ownerId} = ${ownerId})`,
      ),
    );
}

// The groups of the owner by name, with the number of contacts in each (0 for an empty group)
export async function listGroups(ownerId: string) {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: count(contactGroups.contactId),
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .where(eq(groups.ownerId, ownerId))
    .groupBy(groups.id)
    .orderBy(nameOrder, groups.id);
}
