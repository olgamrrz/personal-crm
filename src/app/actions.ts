"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { formatBirthday, parseBirthday } from "@/lib/birthday";
import {
  addNote as insertNote,
  currentYearInMoscow,
  deleteContact as removeContact,
  insertContact,
  recordConversation,
  updateContactBirthday,
  updateContactFrequency,
} from "@/lib/contacts";
import {
  addContactToGroup,
  createGroup as insertGroup,
  deleteGroup as removeGroup,
  removeContactFromGroup,
  renameGroup as updateGroup,
  type GroupSummary,
  type GroupWriteResult,
} from "@/lib/groups";
import { requireUser } from "@/lib/session";
import {
  parseContactForm,
  parseContactFrequency,
  parseGroupIds,
  parseGroupName,
  parseNoteForm,
  readContactForm,
  type ContactFormErrors,
  type ContactFormValues,
} from "@/lib/validation";

export type ContactFormState = {
  errors?: ContactFormErrors;
  // Submitted values are sent back so the form keeps them after a failed attempt;
  // groupIds are the groups that were ticked
  values?: ContactFormValues & { groupIds?: number[] };
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

export type BirthdayChangeResult = {
  error?: string;
  // On success: the date as it is now saved ("05.03"), or an empty text when the date was removed
  value?: string;
};

export type GroupChangeResult = {
  error?: string;
};

export type CreateGroupResult = {
  group?: GroupSummary;
  error?: string;
};

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const user = await requireUser();
  const values = readContactForm(formData);
  const groupIds = parseGroupIds(formData);
  const result = parseContactForm(values, currentYearInMoscow());
  if (!result.success) {
    return { errors: result.errors, values: { ...values, groupIds } };
  }

  // The contact and its groups are saved together; a group deleted in another tab is skipped
  const created = await insertContact(user.id, result.data, groupIds);

  revalidatePath("/");
  revalidatePath("/groups");
  redirect(`/?added=${created.id}`);
}

export async function addNote(
  contactId: number,
  _prevState: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  const user = await requireUser();
  // Bound arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  const result = parseNoteForm(formData);
  if (!result.success) {
    const value = formData.get("body");
    return { error: result.errors, value: typeof value === "string" ? value : "" };
  }

  // Somebody else's contact is "not found", the same as one that does not exist
  if (!(await insertNote(user.id, contactId, result.data))) {
    return { error: "Контакт не найден" };
  }

  // A new note restarts the countdown, so the "Пора связаться" block on the home page changes too
  revalidatePath("/");
  refresh();
  return {};
}

// Used with useActionState: the previous state and form data it passes are not needed here
export async function deleteContact(contactId: number): Promise<DeleteContactState> {
  const user = await requireUser();
  // Bound arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  // The contact's notes go with it: notes.contact_id cascades on delete.
  // A contact already deleted in another tab is gone either way, so this is not an error; somebody else's is left alone.
  await removeContact(user.id, contactId);

  // The contact also leaves its groups, so the numbers on the groups page change
  revalidatePath("/");
  revalidatePath("/groups");
  redirect("/?deleted=1");
}

// Called directly from the select in the contact card; null means "не задано"
export async function setContactFrequency(
  contactId: number,
  frequency: string | null,
): Promise<ContactChangeResult> {
  const user = await requireUser();
  // Arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  const result = parseContactFrequency(frequency);
  if (!result.success) {
    return { error: result.errors };
  }

  if (!(await updateContactFrequency(user.id, contactId, result.data))) {
    return { error: "Контакт не найден" };
  }

  revalidatePath("/");
  refresh();
  return {};
}

// Called directly from the "День рождения" field of the contact card; an empty text removes the date.
// The value comes from the client, so anything but a string counts as empty.
export async function setContactBirthday(contactId: number, value: unknown): Promise<BirthdayChangeResult> {
  const user = await requireUser();
  // Arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  const result = parseBirthday(typeof value === "string" ? value : "", currentYearInMoscow());
  if (!result.success) {
    return { error: result.errors };
  }

  // Somebody else's contact is "not found", the same as one that does not exist
  if (!(await updateContactBirthday(user.id, contactId, result.data))) {
    return { error: "Контакт не найден" };
  }

  // The "Скоро день рождения" block on the home page may change
  revalidatePath("/");
  refresh();
  return { value: result.data ? formatBirthday(result.data) : "" };
}

// "Пообщались": remembers the moment of the conversation without creating a note.
// Called from the contact card and from the "Пора связаться" block; the user stays where they pressed it.
export async function markContacted(contactId: number): Promise<ContactChangeResult> {
  const user = await requireUser();
  // Arguments come from the client, so they must be checked like any other input
  if (!Number.isSafeInteger(contactId) || contactId <= 0) {
    return { error: "Контакт не найден" };
  }

  if (!(await recordConversation(user.id, contactId))) {
    return { error: "Контакт не найден" };
  }

  revalidatePath("/");
  refresh();
  return {};
}

// Ids of groups come from the client too; the database column is a 32-bit integer
function isRowId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2_147_483_647;
}

function groupWriteError(result: Exclude<GroupWriteResult, { ok: true }>) {
  return result.reason === "exists" ? `Группа «${result.existingName}» уже есть` : "Группа не найдена";
}

// The pages that show groups or their numbers
function refreshGroupPages() {
  revalidatePath("/");
  revalidatePath("/groups");
  refresh();
}

// Called directly from the "Группы" page and from the group field; the name arrives as typed
export async function createGroup(name: string): Promise<CreateGroupResult> {
  const user = await requireUser();
  const parsed = parseGroupName(name);
  if (!parsed.success) {
    return { error: parsed.errors };
  }

  const result = await insertGroup(user.id, parsed.data);
  if (!result.ok) {
    return { error: groupWriteError(result) };
  }

  refreshGroupPages();
  return { group: result.group };
}

export async function renameGroup(groupId: number, name: string): Promise<GroupChangeResult> {
  const user = await requireUser();
  if (!isRowId(groupId)) {
    return { error: "Группа не найдена" };
  }

  const parsed = parseGroupName(name);
  if (!parsed.success) {
    return { error: parsed.errors };
  }

  const result = await updateGroup(user.id, groupId, parsed.data);
  if (!result.ok) {
    return { error: groupWriteError(result) };
  }

  refreshGroupPages();
  return {};
}

// The contacts of the group stay; only their links to it go
export async function deleteGroup(groupId: number): Promise<GroupChangeResult> {
  const user = await requireUser();
  if (!isRowId(groupId)) {
    return { error: "Группа не найдена" };
  }

  await removeGroup(user.id, groupId);

  refreshGroupPages();
  return {};
}

// One press, one change: adds the contact to the group or takes it out.
// Both are safe to repeat, so quick double presses end with the last one.
export async function setContactGroup(
  contactId: number,
  groupId: number,
  member: boolean,
): Promise<GroupChangeResult> {
  const user = await requireUser();
  // Arguments come from the client, so they must be checked like any other input
  if (!isRowId(contactId) || !isRowId(groupId) || typeof member !== "boolean") {
    return { error: "Контакт или группа не найдены" };
  }

  if (member) {
    const result = await addContactToGroup(user.id, contactId, groupId);
    if (!result.ok) {
      // The group may be gone: the page is refreshed so the list of groups is up to date
      refreshGroupPages();
      return { error: "Контакт или группа не найдены" };
    }
  } else {
    await removeContactFromGroup(user.id, contactId, groupId);
  }

  refreshGroupPages();
  return {};
}
