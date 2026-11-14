// Form parsing shared by Server Actions. Messages are shown to the user, so they are in Russian.

import { parseBirthday } from "@/lib/birthday";
import { isContactFrequency, type ContactFrequency } from "@/lib/contact-frequency";

export const CONTACT_FIELDS = ["name", "about", "howWeMet", "phone", "email", "birthday"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export const CONTACT_LIMITS: Record<ContactField, number> = {
  name: 200,
  about: 300,
  howWeMet: 500,
  phone: 50,
  email: 254,
  // Only the size of the input: a text that is too long for a date gets the message about the format
  birthday: 10,
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
  // The three go together: all empty, or the day and the month (and maybe the year)
  birthdayDay: number | null;
  birthdayMonth: number | null;
  birthdayYear: number | null;
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

// `currentYear` is the year in Moscow: the caller works it out, so tests can choose their own
export function parseContactForm(
  values: ContactFormValues,
  currentYear: number,
): ParseResult<ContactInput, ContactFormErrors> {
  const errors: ContactFormErrors = {};

  for (const field of CONTACT_FIELDS) {
    if (field !== "birthday" && (values[field] ?? "").length > CONTACT_LIMITS[field]) {
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

  const birthday = parseBirthday(values.birthday ?? "", currentYear);
  if (!birthday.success) {
    errors.birthday = birthday.errors;
  }

  if (!birthday.success || Object.keys(errors).length > 0) {
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
      birthdayDay: birthday.data?.day ?? null,
      birthdayMonth: birthday.data?.month ?? null,
      birthdayYear: birthday.data?.year ?? null,
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

export const SIGN_IN_EMAIL_MAX_LENGTH = 254;
// The rule of Better Auth itself (the email check of the zod library it uses). Anything it would refuse must be
// refused here first, with our message, and what we accept it must accept: src/lib/auth.test.ts checks that.
const SIGN_IN_EMAIL_PATTERN =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
export const SIGN_IN_EMAIL_INVALID = "Проверьте адрес почты";

// The email typed on the sign-in page, in the one form used everywhere: no spaces at the ends, lower case.
// Arguments of Server Actions come from the client, so anything but a string counts as empty.
export function parseSignInEmail(value: unknown): ParseResult<string, string> {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > SIGN_IN_EMAIL_MAX_LENGTH || !SIGN_IN_EMAIL_PATTERN.test(email)) {
    return { success: false, errors: SIGN_IN_EMAIL_INVALID };
  }
  return { success: true, data: email };
}

// null means "не задано"; anything outside the list is rejected
export function parseContactFrequency(value: unknown): ParseResult<ContactFrequency | null, string> {
  if (value === null) {
    return { success: true, data: null };
  }
  if (isContactFrequency(value)) {
    return { success: true, data: value };
  }
  return { success: false, errors: "Такой частоты нет: выберите из списка" };
}
