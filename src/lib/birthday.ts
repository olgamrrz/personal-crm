// Parsing and showing the birthday of a contact. Pure functions with no database and no `server-only`,
// so the server, the form and the tests all use them. Messages are shown to the user, so they are in Russian.

import { pluralize } from "@/lib/format";

export type Birthday = {
  day: number;
  month: number;
  // null when the year is not known
  year: number | null;
};

// null data means "no date": the text was empty
export type ParseBirthdayResult =
  { success: true; data: Birthday | null } | { success: false; errors: string };

export const MIN_BIRTHDAY_YEAR = 1900;

const FORMAT_ERROR = "Введите дату так: 14.03 или 14.03.1990";
const NO_SUCH_DATE = "Такой даты нет";

const BIRTHDAY_PATTERN = /^([0-9]{1,2})\.([0-9]{1,2})(?:\.([0-9]{4}))?$/;

// 29 February is allowed: a birthday may fall on it in a year that has no such day (see the specs)
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// `currentYear` is the year in Moscow; the caller passes it, so tests can choose their own
export function parseBirthday(text: string, currentYear: number): ParseBirthdayResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { success: true, data: null };
  }

  const match = BIRTHDAY_PATTERN.exec(trimmed);
  if (!match) {
    return { success: false, errors: FORMAT_ERROR };
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3] === undefined ? null : Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    return { success: false, errors: NO_SUCH_DATE };
  }

  if (year !== null) {
    if (year > currentYear) {
      return { success: false, errors: "Год не может быть в будущем" };
    }
    if (year < MIN_BIRTHDAY_YEAR) {
      return { success: false, errors: `Год не раньше ${MIN_BIRTHDAY_YEAR}` };
    }
    if (day === 29 && month === 2 && !isLeapYear(year)) {
      return { success: false, errors: NO_SUCH_DATE };
    }
  }

  return { success: true, data: { day, month, year } };
}

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

// The value of the field: "05.03" or "05.03.1990"
export function formatBirthday({ day, month, year }: Birthday) {
  const dayAndMonth = `${twoDigits(day)}.${twoDigits(month)}`;
  return year === null ? dayAndMonth : `${dayAndMonth}.${year}`;
}

// A leap year, so 29 February has its name; UTC keeps the day as is
const dayAndMonthFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

// "18 ноября", for a row of the "Скоро день рождения" block
export function formatBirthdayDate(day: number, month: number) {
  return dayAndMonthFormat.format(new Date(Date.UTC(2000, month - 1, day)));
}

// When the birthday is, for a row of the "Скоро день рождения" block: "сегодня", "завтра" or "через 3 дня"
export function formatDaysUntil(days: number) {
  if (days === 0) return "сегодня";
  if (days === 1) return "завтра";
  return `через ${pluralize(days, "день", "дня", "дней")}`;
}
