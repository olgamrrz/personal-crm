import "server-only";

import { and, count, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, groupNameKeySql, groups } from "@/db/schema";

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

async function findGroupByName(name: string) {
  const [group] = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(sql`${groupNameKeySql(groups.name)} = ${groupNameKeySql(sql`${name}::text`)}`);
  return group;
}

// `name` is already checked by the caller (parseGroupName): not empty, trimmed, not too long
export async function createGroup(name: string): Promise<GroupWriteResult> {
  try {
    const [group] = await db.insert(groups).values({ name }).returning({ id: groups.id, name: groups.name });
    return { ok: true, group };
  } catch (error) {
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      const existing = await findGroupByName(name);
      if (existing) return { ok: false, reason: "exists", existingName: existing.name };
    }
    throw error;
  }
}

// `name` is already checked by the caller. Renaming a group to its own name in another case is the same
// row for the unique index, so it is not a duplicate.
export async function renameGroup(id: number, name: string): Promise<GroupWriteResult> {
  try {
    const [group] = await db
      .update(groups)
      .set({ name })
      .where(eq(groups.id, id))
      .returning({ id: groups.id, name: groups.name });
    return group ? { ok: true, group } : { ok: false, reason: "not-found" };
  } catch (error) {
    if (postgresErrorCode(error) === UNIQUE_VIOLATION) {
      const existing = await findGroupByName(name);
      if (existing) return { ok: false, reason: "exists", existingName: existing.name };
    }
    throw error;
  }
}

// The links of the group go with it (cascade); the contacts and their notes stay.
// A group already deleted in another tab is gone either way, so this is not an error.
export async function deleteGroup(id: number) {
  await db.delete(groups).where(eq(groups.id, id));
}

const FOREIGN_KEY_VIOLATION = "23503";

// Adding twice changes nothing. A contact or a group deleted in the meantime is "not found".
export async function addContactToGroup(
  contactId: number,
  groupId: number,
): Promise<{ ok: true } | { ok: false; reason: "not-found" }> {
  try {
    await db.insert(contactGroups).values({ contactId, groupId }).onConflictDoNothing();
    return { ok: true };
  } catch (error) {
    if (postgresErrorCode(error) === FOREIGN_KEY_VIOLATION) {
      return { ok: false, reason: "not-found" };
    }
    throw error;
  }
}

// Removing a link that is not there is not an error: the contact is out of the group either way
export async function removeContactFromGroup(contactId: number, groupId: number) {
  await db
    .delete(contactGroups)
    .where(and(eq(contactGroups.contactId, contactId), eq(contactGroups.groupId, groupId)));
}

// All groups by name, with the number of contacts in each (0 for an empty group)
export async function listGroups() {
  return db
    .select({
      id: groups.id,
      name: groups.name,
      contactCount: count(contactGroups.contactId),
    })
    .from(groups)
    .leftJoin(contactGroups, eq(contactGroups.groupId, groups.id))
    .groupBy(groups.id)
    .orderBy(nameOrder, groups.id);
}
