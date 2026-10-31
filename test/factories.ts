// Direct inserts for test setup. They do not use the app code under test, so a bug there
// cannot hide behind the setup.

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";

export async function makeContact(name = "Иван Петров") {
  const [contact] = await db.insert(contacts).values({ name }).returning();
  return contact;
}

export async function makeGroup(name: string) {
  const [group] = await db.insert(groups).values({ name }).returning();
  return group;
}

export async function makeNote(contactId: number, body = "Созвонились") {
  const [note] = await db.insert(notes).values({ contactId, body }).returning();
  return note;
}

export async function link(contactId: number, groupId: number) {
  await db.insert(contactGroups).values({ contactId, groupId });
}

export async function countRows(table: typeof contacts | typeof groups | typeof contactGroups | typeof notes) {
  return (await db.select().from(table)).length;
}
