"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  parseContactForm,
  parseNoteForm,
  readContactForm,
  type ContactFormErrors,
  type ContactFormValues,
} from "@/lib/validation";

export type ContactFormState = {
  errors?: ContactFormErrors;
  // Submitted values are sent back so the form keeps them after a failed attempt
  values?: ContactFormValues;
};

export type NoteFormState = {
  error?: string;
  value?: string;
};

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const values = readContactForm(formData);
  const result = parseContactForm(values);
  if (!result.success) {
    return { errors: result.errors, values };
  }

  const [created] = await db
    .insert(contacts)
    .values(result.data)
    .returning({ id: contacts.id });

  revalidatePath("/");
  redirect(`/?added=${created.id}`);
}

export async function addNote(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  // Bound arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  const result = parseNoteForm(formData);
  if (!result.success) {
    const value = formData.get("body");
    return { error: result.errors, value: typeof value === "string" ? value : "" };
  }

  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.id, contactId));
  if (!contact) {
    return { error: "Контакт не найден" };
  }

  await db.insert(notes).values({ contactId, body: result.data });

  refresh();
  return {};
}
