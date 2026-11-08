import "server-only";

import { and, desc, eq, gt, ilike, inArray, isNotNull, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { contactGroups, contacts, groups, notes } from "@/db/schema";
import { CONTACT_FREQUENCIES, type ContactFrequency } from "@/lib/contact-frequency";
import { parseId, type ContactInput } from "@/lib/validation";

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

// Ids of the groups of a contact: the list shows them as labels. The page sends the names of all groups once,
// so a thousand contacts do not repeat them.
const contactGroupIds = sql<
  number[]
>`array(select ${contactGroups.groupId} from ${contactGroups} where ${contactGroups.contactId} = ${contacts.id} order by ${contactGroups.groupId})`;

// Only the contacts of the group. A group that does not exist for this owner (an old link, deleted since, or somebody
// else's) filters nothing, and the same query tells it, so the page needs no second trip to the database.
function inGroup(ownerId: string, groupId: number) {
  return sql`(not exists (select 1 from ${groups} where ${groups.id} = ${groupId} and ${groups.ownerId} = ${ownerId}) or exists (select 1 from ${contactGroups} where ${contactGroups.contactId} = ${contacts.id} and ${contactGroups.groupId} = ${groupId}))`;
}

export async function listContacts(ownerId: string, search = "", groupId?: number) {
  const query = normalizeSearch(search);

  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      about: contacts.about,
      phone: contacts.phone,
      email: contacts.email,
      groupIds: contactGroupIds,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        query ? ilike(searchableName, `%${escapeLikePattern(query)}%`) : undefined,
        groupId === undefined ? undefined : inGroup(ownerId, groupId),
      ),
    )
    .orderBy(nameOrder, contacts.id);
}

// The contact and its groups are saved together or not at all. `data` and `groupIds` are already checked
// by the caller. A group deleted in the meantime (another tab) has no row to link to, so it is skipped,
// and so is a group of somebody else: only groups of the owner are linked.
export async function insertContact(ownerId: string, data: ContactInput, groupIds: number[]) {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contacts)
      .values({ ...data, ownerId })
      .returning({ id: contacts.id });

    if (groupIds.length > 0) {
      await tx.insert(contactGroups).select(
        tx
          .select({
            contactId: sql<number>`${created.id}::integer`.as("contact_id"),
            groupId: sql<number>`${groups.id}`.as("group_id"),
          })
          .from(groups)
          .where(and(inArray(groups.id, groupIds), eq(groups.ownerId, ownerId))),
      );
    }

    return created;
  });
}

// Ids of the groups the contact is in, for the contact card. Somebody else's contact has none.
export async function getContactGroupIds(ownerId: string, contactId: number) {
  const rows = await db
    .select({ groupId: contactGroups.groupId })
    .from(contactGroups)
    .innerJoin(contacts, eq(contacts.id, contactGroups.contactId))
    .where(and(eq(contactGroups.contactId, contactId), eq(contacts.ownerId, ownerId)))
    .orderBy(contactGroups.groupId);
  return rows.map((row) => row.groupId);
}

// null for a contact that does not exist or belongs to somebody else: the two look the same
export async function getContact(ownerId: string, id: number) {
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.id, id), eq(contacts.ownerId, ownerId)));
  return contact ?? null;
}

// "Today" and the day of the last conversation are calendar days in Moscow, whatever the server time zone.
// The database computes them from its own clock, so the home page and the contact card always agree.
const TIME_ZONE = "Europe/Moscow";

function dayInTimeZone(timestamp: SQL) {
  return sql`(${timestamp} at time zone ${sql.raw(`'${TIME_ZONE}'`)})::date`;
}

// The database clock, unless a moment is given: tests pass fixed dates, the app passes none
function momentOrNow(moment?: Date) {
  return moment ? sql`${moment.toISOString()}::timestamptz` : sql`now()`;
}

function todayAt(now?: Date) {
  return dayInTimeZone(momentOrNow(now));
}

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
function overdueDaysAt(now?: Date) {
  return sql<number>`${todayAt(now)} - ${dueDay}`;
}

export type OverdueContact = Awaited<ReturnType<typeof listOverdueContacts>>[number];

// Contacts it is time to reach out to: most overdue first, then by name
export async function listOverdueContacts(ownerId: string, now?: Date) {
  const overdueDays = overdueDaysAt(now);
  return db
    .select({
      id: contacts.id,
      name: contacts.name,
      frequency: sql<ContactFrequency>`${contacts.contactFrequency}`,
      overdueDays,
    })
    .from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), isNotNull(contacts.contactFrequency), gt(overdueDays, 0)))
    .orderBy(desc(overdueDays), nameOrder, contacts.id);
}

// The day of the last conversation in Moscow as YYYY-MM-DD, or null if there has been none
export async function getLastContact(ownerId: string, contactId: number, now?: Date) {
  const lastConversationDay = dayInTimeZone(lastConversationAt);
  const [row] = await db
    .select({
      day: sql<string | null>`${lastConversationDay}::text`,
      isToday: sql<boolean>`coalesce(${lastConversationDay} = ${todayAt(now)}, false)`,
    })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)));
  return row ?? null;
}

// null means "не задано". The countdown of a contact without conversations starts when the frequency is chosen,
// so picking the same option again must not move it. SET expressions see the old row.
// Returns false when there is no such contact.
export async function updateContactFrequency(
  ownerId: string,
  contactId: number,
  frequency: ContactFrequency | null,
  at?: Date,
) {
  const [updated] = await db
    .update(contacts)
    .set({
      contactFrequency: frequency,
      contactFrequencySetAt:
        frequency === null
          ? null
          : sql`case when ${contacts.contactFrequency} is distinct from ${frequency} then ${momentOrNow(at)} else ${contacts.contactFrequencySetAt} end`,
    })
    .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)))
    .returning({ id: contacts.id });
  return updated !== undefined;
}

// "Пообщались": remembers the moment of the conversation without creating a note.
// Returns false when there is no such contact.
export async function recordConversation(ownerId: string, contactId: number, at?: Date) {
  const [updated] = await db
    .update(contacts)
    .set({ lastContactedAt: momentOrNow(at) })
    .where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)))
    .returning({ id: contacts.id });
  return updated !== undefined;
}

// Adds a note to a contact of this owner. Returns false when there is no such contact, and for somebody else's
// contact too: the answer is the same. `body` is already checked by the caller.
export async function addNote(ownerId: string, contactId: number, body: string) {
  // One statement: the note is written only if the contact is the owner's, so there is no gap to slip through
  const added = await db.execute(
    sql`insert into notes (contact_id, body)
        select ${contacts.id}, ${body}::text from ${contacts}
        where ${contacts.id} = ${contactId} and ${contacts.ownerId} = ${ownerId}
        returning id`,
  );
  return added.length > 0;
}

// Deletes a contact of this owner together with its notes and its links to groups (they cascade).
// A contact that is already gone, or is somebody else's, is left alone: that is not an error.
export async function deleteContact(ownerId: string, contactId: number) {
  await db.delete(contacts).where(and(eq(contacts.id, contactId), eq(contacts.ownerId, ownerId)));
}

// The notes belong to the owner of the contact: somebody else's contact has none to show
export async function listNotes(ownerId: string, contactId: number) {
  const rows = await db
    .select({ note: notes })
    .from(notes)
    .innerJoin(contacts, eq(contacts.id, notes.contactId))
    .where(and(eq(notes.contactId, contactId), eq(contacts.ownerId, ownerId)))
    .orderBy(desc(notes.createdAt), desc(notes.id));
  return rows.map((row) => row.note);
}

// Route params arrive as strings; anything but a positive integer is not a valid id
export function parseContactId(value: string): number | null {
  return parseId(value);
}
