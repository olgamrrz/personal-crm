// Form parsing shared by Server Actions. Messages are shown to the user, so they are in Russian.

import { isContactFrequency, type ContactFrequency } from "@/lib/contact-frequency";

export const CONTACT_FIELDS = ["name", "about", "howWeMet", "phone", "email"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export const CONTACT_LIMITS: Record<ContactField, number> = {
  name: 200,
  about: 300,
  howWeMet: 500,
  phone: 50,
  email: 254,
};

export const NOTE_MAX_LENGTH = 5000;

export const GROUP_NAME_MAX_LENGTH = 50;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactInput = {
  name: string;
  about: string | null;
  howWeMet: string | null;
  phone: string | null;
  email: string | null;
};

export type ContactFormValues = Partial<Record<ContactField, string>>;
export type ContactFormErrors = Partial<Record<ContactField, string>>;

type ParseResult<T, E> = { success: true; data: T } | { success: false; errors: E };

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function tooLong(limit: number) {
  return `Слишком длинно: не больше ${limit} символов`;
}

export function readContactForm(formData: FormData): ContactFormValues {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, readText(formData, field)]));
}

export function parseContactForm(
  values: ContactFormValues,
): ParseResult<ContactInput, ContactFormErrors> {
  const errors: ContactFormErrors = {};

  for (const field of CONTACT_FIELDS) {
    if ((values[field] ?? "").length > CONTACT_LIMITS[field]) {
      errors[field] = tooLong(CONTACT_LIMITS[field]);
    }
  }

  const name = values.name ?? "";
  if (!name) {
    errors.name = "Укажите имя";
  }

  const email = values.email ?? "";
  if (email && !errors.email && !EMAIL_PATTERN.test(email)) {
    errors.email = "Похоже, в адресе почты ошибка. Пример: anna@example.com";
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      name,
      about: values.about || null,
      howWeMet: values.howWeMet || null,
      phone: values.phone || null,
      email: email || null,
    },
  };
}

export function parseNoteForm(formData: FormData): ParseResult<string, string> {
  const body = readText(formData, "body");
  if (!body) {
    return { success: false, errors: "Напишите текст заметки" };
  }
  if (body.length > NOTE_MAX_LENGTH) {
    return { success: false, errors: tooLong(NOTE_MAX_LENGTH) };
  }
  return { success: true, data: body };
}

// Ids arrive as strings (route params, URL parameters, form fields);
// anything but a positive integer is not a valid id
export function parseId(value: string): number | null {
  if (!/^\d{1,9}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

// Groups ticked in the form: every valid `groupIds` value once, in the order they come.
// Whether a group still exists is the database's business: the ones deleted meanwhile are skipped there.
export function parseGroupIds(formData: FormData): number[] {
  const ids = new Set<number>();
  for (const value of formData.getAll("groupIds")) {
    const id = typeof value === "string" ? parseId(value) : null;
    if (id !== null) ids.add(id);
  }
  return [...ids];
}

// The name of a group as typed, without spaces at the ends. Arguments of Server Actions come from
// the client, so anything but a string counts as empty.
export function parseGroupName(value: unknown): ParseResult<string, string> {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    return { success: false, errors: "Введите название группы" };
  }
  if (name.length > GROUP_NAME_MAX_LENGTH) {
    return { success: false, errors: tooLong(GROUP_NAME_MAX_LENGTH) };
  }
  return { success: true, data: name };
}

// null means "не задано"; anything outside the list is rejected
export function parseContactFrequency(
  value: unknown,
): ParseResult<ContactFrequency | null, string> {
  if (value === null) {
    return { success: true, data: null };
  }
  if (isContactFrequency(value)) {
    return { success: true, data: value };
  }
  return { success: false, errors: "Такой частоты нет: выберите из списка" };
}
