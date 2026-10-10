// Fills an empty database with realistic test contacts and notes.
// Usage: pnpm db:seed
// The script never deletes anything: if contacts already exist, it stops.

import { fakerRU as faker } from "@faker-js/faker";
import { loadEnvConfig } from "@next/env";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { contacts, notes, type NewNote } from "../src/db/schema";

const CONTACT_COUNT = 1000;
const BATCH_SIZE = 250;

type Sex = "male" | "female";

// Common modern first names; Faker's own list has many rare ones
const FIRST_NAMES: Record<Sex, string[]> = {
  male: [
    "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим", "Валерий", "Василий",
    "Виктор", "Виталий", "Владимир", "Владислав", "Георгий", "Глеб", "Григорий", "Даниил",
    "Денис", "Дмитрий", "Евгений", "Егор", "Иван", "Игорь", "Илья", "Кирилл", "Константин",
    "Леонид", "Максим", "Марк", "Матвей", "Михаил", "Никита", "Николай", "Олег", "Павел",
    "Пётр", "Роман", "Руслан", "Сергей", "Степан", "Тимофей", "Фёдор", "Юрий", "Ярослав",
  ],
  female: [
    "Александра", "Алёна", "Алина", "Алиса", "Анастасия", "Ангелина", "Анна", "Арина",
    "Валентина", "Валерия", "Вера", "Вероника", "Виктория", "Галина", "Дарья", "Диана",
    "Екатерина", "Елена", "Елизавета", "Жанна", "Злата", "Инна", "Ирина", "Карина", "Кира",
    "Ксения", "Лариса", "Любовь", "Людмила", "Маргарита", "Марина", "Мария", "Милана",
    "Надежда", "Наталья", "Нина", "Ольга", "Полина", "Светлана", "София", "Татьяна", "Ульяна",
    "Юлия", "Яна",
  ],
};

// "Who is this": [male form, female form]
const ROLES: [string, string][] = [
  ["Дизайнер интерфейсов", "Дизайнер интерфейсов"],
  ["Бывший коллега", "Бывшая коллега"],
  ["Однокурсник", "Однокурсница"],
  ["Одноклассник", "Одноклассница"],
  ["Сосед по подъезду", "Соседка по подъезду"],
  ["Друг детства", "Подруга детства"],
  ["Фотограф", "Фотограф"],
  ["Юрист", "Юрист"],
  ["Бухгалтер", "Бухгалтер"],
  ["Стоматолог", "Стоматолог"],
  ["Тренер по плаванию", "Тренер по йоге"],
  ["Риелтор", "Риелтор"],
  ["Продакт-менеджер", "Продакт-менеджер"],
  ["Фронтенд-разработчик", "Фронтенд-разработчица"],
  ["Бэкенд-разработчик", "Аналитик данных"],
  ["Маркетолог", "Маркетолог"],
  ["Преподаватель английского", "Преподавательница английского"],
  ["Архитектор", "Архитектор"],
  ["Врач-терапевт", "Врач-педиатр"],
  ["Мастер по ремонту", "Мастер маникюра"],
  ["Автомеханик", "Флорист"],
  ["Основатель стартапа", "Основательница стартапа"],
  ["Журналист", "Журналистка"],
  ["Музыкант", "Музыкантка"],
  ["Рекрутер", "Рекрутер"],
  ["Финансовый консультант", "Финансовый консультант"],
  ["Руководитель отдела продаж", "HR-директор"],
  ["Повар", "Кондитер"],
  ["Психолог", "Психолог"],
  ["Организатор митапов", "Организатор конференций"],
  ["Брат друга", "Сестра подруги"],
  ["Знакомый по даче", "Знакомая по даче"],
];

const HOW_WE_MET: string[] = [
  "Работали вместе в банке",
  "Работали вместе в агентстве",
  "Учились в одной группе в университете",
  "Учились в одном классе",
  "Познакомились на конференции по дизайну",
  "Познакомились на IT-конференции",
  "Через общих друзей",
  "Соседи по подъезду",
  "Ходим в один спортзал",
  "Познакомились в походе на Алтае",
  "Вместе ходили на курсы английского",
  "Жили в одном дворе в детстве",
  "Познакомились на свадьбе у друзей",
  "Познакомились в летнем лагере",
  "Вместе волонтёрили в фонде",
  "Сидели рядом в самолёте",
  "Познакомились на книжном клубе",
  "Пересекались на митапах",
  "Познакомились на стажировке",
  "Вместе снимали квартиру",
  "Познакомились в поездке в Грузию",
  "Через родителей",
  "Познакомились на беговом клубе",
  "Коллега по прошлой работе",
  "Знакомы по дачному посёлку",
];

const TOPICS = [
  "новый проект", "переезд", "поиск работы", "ремонт квартиры", "отпуск",
  "идею для стартапа", "курсы по аналитике", "покупку машины", "детский сад для сына",
  "планы на лето", "идею книги", "смену профессии",
];

const PROMISES = [
  "контакты хорошего юриста", "ссылку на курс", "резюме", "фотографии с поездки",
  "список книг", "презентацию проекта", "контакт риелтора", "рецепт пирога",
  "приглашение на мероприятие", "запись выступления",
];

const WHEN = [
  "на следующей неделе", "в начале месяца", "после праздников", "в выходные",
  "через пару недель", "весной", "осенью", "до конца месяца",
];

const EVENTS = [
  "концерт", "выставку", "конференцию", "забег", "спектакль", "фестиваль", "лекцию",
];

// Note templates: what was discussed and agreed on. `g` picks the male or female verb form.
type Gender = (male: string, female: string) => string;
const NOTE_TEMPLATES: ((g: Gender) => string)[] = [
  () => `Созвонились, обсудили ${pick(TOPICS)}. Договорились встретиться ${pick(WHEN)}.`,
  (g) => `${g("Обещал", "Обещала")} прислать ${pick(PROMISES)}.`,
  () => `С меня ${pick(PROMISES)} — не забыть отправить!`,
  (g) => `Созвонились в ${g("его", "её")} день рождения. ${g("Рассказал", "Рассказала")} про ${pick(TOPICS)}.`,
  () => `Договорились вместе сходить на ${pick(EVENTS)} ${pick(WHEN)}.`,
  (g) => `${g("Попросил", "Попросила")} совета про ${pick(TOPICS)}. Поделились полезными ссылками.`,
  () => `Встретились на кофе. Обсудили ${pick(TOPICS)}, договорились созвониться ${pick(WHEN)}.`,
  () => "Ищет новую работу — если услышу о вакансии, сразу написать.",
  () => `Списались в мессенджере. Предварительно договорились увидеться ${pick(WHEN)}.`,
  (g) => `${g("Вернулся", "Вернулась")} из отпуска, много интересного про поездку. Надо позвать в гости.`,
  () => `Обсудили ${pick(TOPICS)}. Решили вернуться к разговору ${pick(WHEN)}.`,
  (g) => `${g("Помог", "Помогла")} с ${pick(["переездом", "резюме", "выбором ноутбука", "документами", "ремонтом"])}. Надо отблагодарить.`,
];

function pick<T>(items: readonly T[]): T {
  return faker.helpers.arrayElement(items);
}

function maybe<T>(probability: number, value: () => T): T | null {
  return faker.datatype.boolean({ probability }) ? value() : null;
}

function russianMobile() {
  const digits = faker.string.numeric(9);
  return `+7 (9${digits.slice(0, 2)}) ${digits.slice(2, 5)}-${digits.slice(5, 7)}-${digits.slice(7, 9)}`;
}

function buildContact(createdFrom: Date, createdTo: Date) {
  const sex: Sex = faker.datatype.boolean() ? "male" : "female";
  const firstName = pick(FIRST_NAMES[sex]);
  const lastName = faker.person.lastName(sex);
  const [roleMale, roleFemale] = pick(ROLES);
  const g: Gender = (male, female) => (sex === "male" ? male : female);

  const createdAt = faker.date.between({ from: createdFrom, to: createdTo });
  const noteCount = faker.helpers.weightedArrayElement([
    { weight: 25, value: 0 },
    { weight: 35, value: 1 },
    { weight: 25, value: 2 },
    { weight: 15, value: 3 },
  ]);
  const noteDates = faker.date
    .betweens({ from: createdAt, to: createdTo, count: noteCount })
    .sort((a, b) => a.getTime() - b.getTime());

  return {
    contact: {
      name: `${firstName} ${lastName}`,
      about: maybe(0.9, () => g(roleMale, roleFemale)),
      howWeMet: maybe(0.85, () => pick(HOW_WE_MET)),
      phone: maybe(0.9, russianMobile),
      email: maybe(0.8, () =>
        faker.internet
          .email({
            firstName,
            lastName,
            provider: pick(["gmail.com", "yandex.ru", "mail.ru", "icloud.com", "outlook.com"]),
          })
          .toLowerCase(),
      ),
      createdAt,
    },
    notes: noteDates.map((date) => ({ body: pick(NOTE_TEMPLATES)(g), createdAt: date })),
  };
}

async function main() {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client);

  try {
    const [{ value: existing }] = await db.select({ value: count() }).from(contacts);
    if (existing > 0) {
      console.log(`Database already has ${existing} contacts, seeding skipped. Nothing was changed.`);
      return;
    }

    // Fixed seed: every run produces the same people and notes
    faker.seed(20261010);
    const createdTo = new Date();
    const createdFrom = new Date(createdTo);
    createdFrom.setFullYear(createdFrom.getFullYear() - 3);

    const people = Array.from({ length: CONTACT_COUNT }, () => buildContact(createdFrom, createdTo));

    let noteTotal = 0;
    await db.transaction(async (tx) => {
      for (let start = 0; start < people.length; start += BATCH_SIZE) {
        const batch = people.slice(start, start + BATCH_SIZE);
        const inserted = await tx
          .insert(contacts)
          .values(batch.map((person) => person.contact))
          .returning({ id: contacts.id });

        const batchNotes: NewNote[] = batch.flatMap((person, index) =>
          person.notes.map((note) => ({ ...note, contactId: inserted[index].id })),
        );
        if (batchNotes.length > 0) {
          await tx.insert(notes).values(batchNotes);
        }
        noteTotal += batchNotes.length;
      }
    });

    console.log(`Seeded ${people.length} contacts and ${noteTotal} notes.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
