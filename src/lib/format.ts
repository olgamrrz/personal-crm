const pluralRules = new Intl.PluralRules("ru-RU");

// Russian nouns have three plural forms: 1 контакт, 2 контакта, 5 контактов
export function pluralize(count: number, one: string, few: string, many: string) {
  const form = pluralRules.select(count);
  const word = form === "one" ? one : form === "few" ? few : many;
  return `${count} ${word}`;
}

const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(date: Date) {
  return dateTimeFormat.format(date);
}

// Calendar days come from the database as YYYY-MM-DD; UTC keeps the day as is
const dayFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// "сегодня", "19 сентября 2026 г." or "ещё не общались"
export function formatLastConversation(day: string | null, isToday: boolean) {
  if (!day) return "ещё не общались";
  if (isToday) return "сегодня";
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

export function initials(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

// Phone numbers are stored as typed; links need only digits and a leading plus
export function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
