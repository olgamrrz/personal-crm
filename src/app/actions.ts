"use server";

import { eq, sql } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { contacts, notes } from "@/db/schema";
import {
  parseContactForm,
  parseContactFrequency,
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

export type DeleteContactState = {
  error?: string;
};

export type ContactChangeResult = {
  error?: string;
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

  // A new note restarts the countdown, so the "Пора связаться" block on the home page changes too
  revalidatePath("/");
  refresh();
  return {};
}

// Used with useActionState: the previous state and form data it passes are not needed here
export async function deleteContact(contactId: number): Promise<DeleteContactState> {
  // Bound arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  // The contact's notes go with it: notes.contact_id cascades on delete.
  // A contact already deleted in another tab is gone either way, so this is not an error.
  await db.delete(contacts).where(eq(contacts.id, contactId));

  revalidatePath("/");
  redirect("/?deleted=1");
}

// Called directly from the select in the contact card; null means "не задано"
export async function setContactFrequency(
  contactId: number,
  frequency: string | null,
): Promise<ContactChangeResult> {
  // Arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  const result = parseContactFrequency(frequency);
  if (!result.success) {
    return { error: result.errors };
  }

  // The countdown of a contact without conversations starts when the frequency is chosen,
  // so picking the same option again must not move it. SET expressions see the old row.
  const [updated] = await db
    .update(contacts)
    .set({
      contactFrequency: result.data,
      contactFrequencySetAt:
        result.data === null
          ? null
          : sql`case when ${contacts.contactFrequency} is distinct from ${result.data} then now() else ${contacts.contactFrequencySetAt} end`,
    })
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });
  if (!updated) {
    return { error: "Контакт не найден" };
  }

  revalidatePath("/");
  refresh();
  return {};
}

// "Пообщались": remembers the moment of the conversation without creating a note.
// Called from the contact card and from the "Пора связаться" block; the user stays where they pressed it.
export async function markContacted(contactId: number): Promise<ContactChangeResult> {
  // Arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  const [updated] = await db
    .update(contacts)
    .set({ lastContactedAt: sql`now()` })
    .where(eq(contacts.id, contactId))
    .returning({ id: contacts.id });
  if (!updated) {
    return { error: "Контакт не найден" };
  }

  revalidatePath("/");
  refresh();
  return {};
}
