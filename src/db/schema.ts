import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// The Docker image copies this file alone for the seed script, so it imports nothing from src/.
// Labels for these values live in src/lib/contact-frequency.ts, which is type-checked against them.
const CONTACT_FREQUENCY_VALUES = ["week", "month", "quarter", "year"] as const;

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    // "Who is this": a short description, e.g. "designer, former colleague"
    about: text("about"),
    howWeMet: text("how_we_met"),
    phone: text("phone"),
    email: text("email"),
    // How often to keep in touch; null means "not set"
    contactFrequency: text("contact_frequency", { enum: CONTACT_FREQUENCY_VALUES }),
    // When the frequency was last chosen or changed; null while it is not set
    contactFrequencySetAt: timestamp("contact_frequency_set_at", { withTimezone: true }),
    // When "Пообщались" was last pressed; it does not create a note
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contacts_name_idx").on(table.name),
    check(
      "contacts_contact_frequency_check",
      sql`${table.contactFrequency} in (${sql.raw(CONTACT_FREQUENCY_VALUES.map((value) => `'${value}'`).join(", "))})`,
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notes_contact_id_idx").on(table.contactId)],
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
