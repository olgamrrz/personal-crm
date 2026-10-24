import "server-only";

import { and, desc, eq, gt, ilike, isNotNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import { CONTACT_FREQUENCIES, type ContactFrequency } from "@/lib/contact-frequency";

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

// "Today" and the day of the last conversation are calendar days in Moscow, whatever the server time zone.
// The database computes them from its own clock, so the home page and the contact card always agree.
const TIME_ZONE = "Europe/Moscow";

function dayInTimeZone(timestamp: SQL) {
  return sql`(${timestamp} at time zone ${sql.raw(`'${TIME_ZONE}'`)})::date`;
}

const today = dayInTimeZone(sql`now()`);

// The last conversation is the later of the latest note and the last "Пообщались" press.
// greatest() skips nulls, so it is null only when there has been neither.
const lastNoteAt = sql`(select max(${notes.createdAt}) from ${notes} where ${notes.contactId} = ${contacts.id})`;
const lastConversationAt = sql`greatest(${lastNoteAt}, ${contacts.lastContactedAt})`;

// Without any conversation the countdown starts when the frequency was chosen
const countdownStartAt = sql`coalesce(${lastConversationAt}, ${contacts.contactFrequencySetAt})`;

// Calendar periods: Postgres adds months by the calendar and clamps to the month end (Jan 31 + 1 month = Feb 28)
const FREQUENCY_PERIODS: Record<ContactFrequency, string> = {
  week: "7 days",
  month: "1 month",
  quarter: "3 months",
  year: "1 year",
};

const period = sql`case ${contacts.contactFrequency} ${sql.raw(
  CONTACT_FREQUENCIES.map(
    (frequency) => `when '${frequency}' then interval '${FREQUENCY_PERIODS[frequency]}'`,
  ).join(" "),
)} end`;

const dueDay = sql`(${dayInTimeZone(countdownStartAt)} + ${period})::date`;

// On the due day the contact is not overdue yet; the day after, it is overdue by 1 day
const overdueDays = sql<number>`${today} - ${dueDay}`;

export type OverdueContact = Awaited<ReturnType<typeof listOverdueContacts>>[number];

// Contacts it is time to reach out to: most overdue first, then by name
export async function listOverdueContacts() {
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      frequency: sql<ContactFrequency>`${contacts.contactFrequency}`,
      overdueDays,
    })
    .from(contacts)
    .where(and(isNotNull(contacts.contactFrequency), gt(overdueDays, 0)))
    .orderBy(desc(overdueDays), nameOrder, contacts.id);
}

// The day of the last conversation in Moscow as YYYY-MM-DD, or null if there has been none
export async function getLastContact(contactId: number) {
  const lastConversationDay = dayInTimeZone(lastConversationAt);
  const [row] = await db
    .select({
      day: sql<string | null>`${lastConversationDay}::text`,
      isToday: sql<boolean>`coalesce(${lastConversationDay} = ${today}, false)`,
    })
    .from(contacts)
    .where(eq(contacts.id, contactId));
  return row ?? null;
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
