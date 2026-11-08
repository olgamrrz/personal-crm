// Direct inserts for test setup. They do not use the app code under test, so a bug there
// cannot hide behind the setup.

import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes, users, type NewContact } from "@/db/schema";

// A person who has signed in. Every contact and group belongs to one, so a test starts by making one (or two,
// when it checks that people do not see each other's data). Without an address, a unique one is made.
export async function makeUser(email = `user-${randomUUID()}@example.com`) {
  const [user] = await db
    .insert(users)
    .values({ id: randomUUID(), name: "", email, emailVerified: true })
    .returning();
  return user;
}

// `fields` sets the rest of the row, e.g. the frequency and the moments of the countdown
export async function makeContact(
  ownerId: string,
  name = "Иван Петров",
  fields: Omit<NewContact, "name" | "ownerId"> = {},
) {
  const [contact] = await db
    .insert(contacts)
    .values({ ...fields, ownerId, name })
    .returning();
  return contact;
}

export async function makeGroup(ownerId: string, name: string) {
  const [group] = await db.insert(groups).values({ ownerId, name }).returning();
  return group;
}

// Without `createdAt` the note is written now
export async function makeNote(contactId: number, body = "Созвонились", createdAt?: Date) {
  const [note] = await db.insert(notes).values({ contactId, body, createdAt }).returning();
  return note;
}

export async function link(contactId: number, groupId: number) {
  await db.insert(contactGroups).values({ contactId, groupId });
}

export async function countRows(
  table: typeof contacts | typeof groups | typeof contactGroups | typeof notes | typeof users,
) {
  return (await db.select().from(table)).length;
}
