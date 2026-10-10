import "server-only";

import { desc, eq, ilike, sql } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";

// Sort names the way a Russian reader expects (case-insensitive, Ё next to Е)
const nameOrder = sql`${contacts.name} collate "ru-RU-x-icu"`;

// Treat Ё and Е as the same letter in search: "Алена" finds "Алёна" and vice versa
const searchableName = sql<string>`translate(${contacts.name}, 'Ёё', 'Ее')`;

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function normalizeSearch(value: string) {
  return value.trim().replace(/\s+/g, " ").replace(/Ё/g, "Е").replace(/ё/g, "е");
}

export type ContactListItem = Awaited<ReturnType<typeof listContacts>>[number];

export async function listContacts(search = "") {
  const query = normalizeSearch(search);

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
    })
    .from(contacts)
    .where(query ? ilike(searchableName, `%${escapeLikePattern(query)}%`) : undefined)
    .orderBy(nameOrder, contacts.id);
}

export async function getContact(id: number) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact ?? null;
}

export async function listNotes(contactId: number) {
  return db
    .select()
    .from(notes)
    .where(eq(notes.contactId, contactId))
    .orderBy(desc(notes.createdAt), desc(notes.id));
}

// Route params arrive as strings; anything but a positive integer is not a valid id
export function parseContactId(value: string): number | null {
  if (!/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}
