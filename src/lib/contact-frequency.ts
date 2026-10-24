// How often to keep in touch with a contact. Shared by validation, the select in the contact card
// and the "time to reach out" block on the home page.

import type { Contact } from "@/db/schema";

export type ContactFrequency = NonNullable<Contact["contactFrequency"]>;

// Same values and order as in the database schema; the type check keeps them in sync
export const CONTACT_FREQUENCIES = [
  "week",
  "month",
  "quarter",
  "year",
] as const satisfies readonly ContactFrequency[];

// Labels are shown to the user, so they are in Russian
export const CONTACT_FREQUENCY_LABELS: Record<ContactFrequency, string> = {
  week: "раз в неделю",
  month: "раз в месяц",
  quarter: "раз в квартал",
  year: "раз в год",
};

export const NO_FREQUENCY_LABEL = "не задано";

export function isContactFrequency(value: unknown): value is ContactFrequency {
  return typeof value === "string" && (CONTACT_FREQUENCIES as readonly string[]).includes(value);
}
