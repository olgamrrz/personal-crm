// Direct access to the database of the browser tests: a clean start before each test, and the contacts
// a test needs before it opens the app. It does not go through the app code, so a bug there cannot hide
// behind the setup.

import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contactGroups, contacts, groups, notes, sessions, users, verifications } from "@/db/schema";
import type { ContactFrequency } from "@/lib/contact-frequency";

import { E2E_DATABASE_SUFFIX, getTestDatabase } from "../test/database.mts";
import { clearTestDatabase } from "../test/database-setup.mts";

// A connection per call: a test touches the database once or twice, and nothing is left open
async function withDatabase<T>(work: (client: postgres.Sql) => Promise<T>) {
  const client = postgres(getTestDatabase(E2E_DATABASE_SUFFIX).url, { max: 1, onnotice: () => {} });
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export function resetDatabase() {
  return withDatabase(clearTestDatabase);
}

export function insertContacts(ownerId: string, names: string[]) {
  return withDatabase(async (client) => {
    await drizzle(client)
      .insert(contacts)
      .values(names.map((name) => ({ ownerId, name })));
  });
}

export type BirthdayDate = { day: number; month: number; year?: number | null };

// One contact with a keep-in-touch history, returns its id. With `talkedAt` the contact has a note written
// then, and the frequency was chosen at that moment too; without it the frequency has just been chosen.
// The app counts from the database clock, so tests give moments counted back from now.
// With `birthday` the contact has that day of birth; the year may be left out.
export function insertContact(
  ownerId: string,
  name: string,
  {
    frequency = null,
    talkedAt,
    birthday,
  }: { frequency?: ContactFrequency | null; talkedAt?: Date; birthday?: BirthdayDate } = {},
) {
  return withDatabase(async (client) => {
    const db = drizzle(client);
    const [contact] = await db
      .insert(contacts)
      .values({
        ownerId,
        name,
        contactFrequency: frequency,
        contactFrequencySetAt: frequency ? (talkedAt ?? new Date()) : null,
        birthdayDay: birthday?.day ?? null,
        birthdayMonth: birthday?.month ?? null,
        birthdayYear: birthday?.year ?? null,
      })
      .returning({ id: contacts.id });
    if (talkedAt) {
      await db.insert(notes).values({ contactId: contact.id, body: "Созвонились", createdAt: talkedAt });
    }
    return contact.id;
  });
}

// A group of this person, returns its id
export function insertGroup(ownerId: string, name: string) {
  return withDatabase(async (client) => {
    const [group] = await drizzle(client)
      .insert(groups)
      .values({ ownerId, name })
      .returning({ id: groups.id });
    return group.id;
  });
}

// Puts a contact into a group (both are of the same person)
export function addToGroup(contactId: number, groupId: number) {
  return withDatabase(async (client) => {
    await drizzle(client).insert(contactGroups).values({ contactId, groupId });
  });
}

// A person who has signed in before: the row Better Auth creates at the first sign-in, written straight to the
// database. Returns the id of the user.
export function insertUser(email: string) {
  return withDatabase(async (client) => {
    const [user] = await drizzle(client)
      .insert(users)
      .values({ id: randomUUID(), name: "", email, emailVerified: true })
      .returning({ id: users.id });
    return user.id;
  });
}

// The users in the database, to check what the first sign-in has created
export function listUsers() {
  return withDatabase((client) => drizzle(client).select().from(users));
}

// Time is not waited for but moved in the database: the sign-in links of this address are made older than
// `minutes` minutes, as if they had been asked for that long ago (a link lives 15 minutes)
export function ageSignInLinks(email: string, minutes: number) {
  return withDatabase(async (client) => {
    await drizzle(client)
      .update(verifications)
      .set({ expiresAt: new Date(Date.now() + (15 - minutes) * 60_000) })
      .where(like(verifications.value, `%${email}%`));
  });
}

// Ends every sign-in on the server side, as if the term had run out; the browser still holds its cookie
export function deleteSessions() {
  return withDatabase(async (client) => {
    await drizzle(client).delete(sessions);
  });
}

export function countNotes() {
  return withDatabase(async (client) => (await drizzle(client).select().from(notes)).length);
}

// Time is moved in the database, not waited for. Better Auth counts the 30 days from the last renewal, which
// is the term minus 30 days, so «`days` days since the last visit» means a term of `30 - days` days from now.
export function setSignInTermDaysLeft(email: string, daysLeft: number) {
  return withDatabase(async (client) => {
    const db = drizzle(client);
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + daysLeft * 24 * 60 * 60_000) })
      .where(eq(sessions.userId, user.id));
  });
}

// When the sign-in of this address ends, according to the server (one session per address expected)
export function getSignInTermEnd(email: string) {
  return withDatabase(async (client) => {
    const [row] = await drizzle(client)
      .select({ expiresAt: sessions.expiresAt })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(users.email, email));
    return row.expiresAt;
  });
}
