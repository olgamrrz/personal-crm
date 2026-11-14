import { sql, type SQLWrapper } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// The Docker image copies this file alone for the seed script, so it imports nothing from src/.
// Labels for these values live in src/lib/contact-frequency.ts, which is type-checked against them.
const CONTACT_FREQUENCY_VALUES = ["week", "month", "quarter", "year"] as const;

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Whose contact it is. No cascade: nothing in the app deletes users, and deleting one in the database
    // by mistake must not take their contacts along.
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    // "Who is this": a short description, e.g. "designer, former colleague"
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // Birthday: the day and the month go together, the year is optional. All three are null when there is no date.
    // That the year is not in the future and that 29 February has a leap year are checked in the app code:
    // a constraint cannot know "today in Moscow", and one that depends on time breaks a restore from a backup.
    birthdayDay: smallint("birthday_day"),
    birthdayMonth: smallint("birthday_month"),
    birthdayYear: smallint("birthday_year"),
    // How often to keep in touch; null means "not set"
    contactFrequency: text("contact_frequency", { enum: CONTACT_FREQUENCY_VALUES }),
    // When the frequency was last chosen or changed; null while it is not set
    contactFrequencySetAt: timestamp("contact_frequency_set_at", { withTimezone: true }),
    // When "Пообщались" was last pressed; it does not create a note
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("contacts_name_idx").on(table.name),
    index("contacts_owner_id_idx").on(table.ownerId),
    check(
      "contacts_contact_frequency_check",
      sql`${table.contactFrequency} in (${sql.raw(CONTACT_FREQUENCY_VALUES.map((value) => `'${value}'`).join(", "))})`,
    ),
    // The day and the month are both empty or both set; the day exists in the month (29 February is allowed)
    check(
      "contacts_birthday_check",
      sql`(${table.birthdayDay} is null and ${table.birthdayMonth} is null) or (${table.birthdayDay} is not null and ${table.birthdayMonth} is not null and ${table.birthdayMonth} between 1 and 12 and ${table.birthdayDay} between 1 and (case ${table.birthdayMonth} when 2 then 29 when 4 then 30 when 6 then 30 when 9 then 30 when 11 then 30 else 31 end))`,
    ),
    // A year without a day and a month means nothing
    check(
      "contacts_birthday_year_check",
      sql`${table.birthdayYear} is null or ${table.birthdayDay} is not null`,
    ),
  ],
);

// Notes are appended after each conversation: what was discussed and agreed on
export const notes = pgTable(
  "notes",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notes_contact_id_idx").on(table.contactId)],
);

// Two group names are the same group when this key is equal: case does not matter, and Ё equals Е.
// Case follows the ICU rules, like the sorting of names. The unique index below and the lookups in
// src/lib/groups.ts both use this expression, so the database has the last word on duplicates (per owner).
export function groupNameKeySql(name: SQLWrapper) {
  return sql`lower(translate(${name}, 'Ёё', 'Ее') collate "ru-RU-x-icu")`;
}

// Groups of contacts: created by the user (family, friends, tennis)
export const groups = pgTable(
  "groups",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Whose group it is; no cascade, as for contacts
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    // Shown as typed; its length and emptiness are checked in the app code
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Two people may both have «Друзья»; one person may not
  (table) => [uniqueIndex("groups_owner_name_key_idx").on(table.ownerId, groupNameKeySql(table.name))],
);

// Which contact is in which group; a contact is in a group at most once.
// Deleting a contact or a group removes its links, nothing else.
export const contactGroups = pgTable(
  "contact_groups",
  {
    contactId: integer("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.groupId] }),
    index("contact_groups_group_id_idx").on(table.groupId),
  ],
);

// Tables of Better Auth (sign-in by email link). The shape is what `pnpm dlx auth@<version> generate` gives
// for our setup (src/lib/auth.ts); check it again when Better Auth is upgraded.
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  // Better Auth requires a name; we never ask for one, so it stays an empty string
  name: text("name").notNull(),
  // Always lower case, without spaces around
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// Better Auth keeps one row per sign-in method; with sign-in by link it is only used internally
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)],
);

// Sign-in links: `identifier` holds a hash of the link, `value` the email (JSON)
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// Emails with sign-in links that were sent, for the limit of 3 per email per 10 minutes.
// Rows older than 10 minutes are deleted on every request for a link.
export const signInEmails = pgTable(
  "sign_in_emails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sign_in_emails_email_sent_at_idx").on(table.email, table.sentAt)],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type User = typeof users.$inferSelect;
