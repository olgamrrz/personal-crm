// The main scenario of the product (specs/01-продуктовая-идея.md), done in a real browser the way a person
// does it, one test per success criterion:
//   - open the app: all contacts are listed
//   - add a contact, find it by name, write a note: the changes are saved in the contact's card
//   - open the same address in another browser: the same contacts are there

import { expect, test, type Page } from "@playwright/test";

import { insertContacts, resetDatabase } from "./database";

const NEW_CONTACT = {
  name: "Мария Соколова",
  about: "архитектор, соседка по даче",
  howWeMet: "вместе ходили в поход на Алтай",
  phone: "+7 916 555-12-34",
  email: "maria.sokolova@example.com",
};

const NOTE = "Договорились в субботу вместе посмотреть участок";

// People who are already in the CRM, so that the list and the search have something besides the new contact
const KNOWN_PEOPLE = ["Анна Смирнова", "Борис Иванов"];

test.beforeEach(async () => {
  await resetDatabase();
});

// Starts on the home page and ends there, with the new contact in the list
async function addContact(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "Добавить контакт" }).click();

  await page.getByLabel("Имя").fill(NEW_CONTACT.name);
  await page.getByLabel("Кто это").fill(NEW_CONTACT.about);
  await page.getByLabel("Откуда знакомы").fill(NEW_CONTACT.howWeMet);
  await page.getByLabel("Телефон").fill(NEW_CONTACT.phone);
  await page.getByLabel("Почта").fill(NEW_CONTACT.email);
  await page.getByRole("button", { name: "Сохранить контакт" }).click();

  await expect(page.getByRole("status")).toContainText(`Контакт «${NEW_CONTACT.name}» добавлен`);
  await expect(page.getByRole("link", { name: NEW_CONTACT.name })).toBeVisible();
}

// Starts and ends in the contact's card
async function addNote(page: Page) {
  await page.getByRole("textbox", { name: "Новая заметка" }).fill(NOTE);
  await page.getByRole("button", { name: "Добавить заметку" }).click();

  await expect(page.getByRole("list", { name: "1 заметка" })).toContainText(NOTE);
}

test("opening the app shows all contacts", async ({ page }) => {
  const everybody = ["Анна Смирнова", "Борис Иванов", "Вера Ким"];
  await insertContacts(everybody);

  await page.goto("/");

  await expect(page.getByText("3 контакта")).toBeVisible();
  for (const name of everybody) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
});

test("a contact added and found by name keeps the note written in its card", async ({ page }) => {
  await insertContacts(KNOWN_PEOPLE);

  await test.step("add a contact: it appears in the list", async () => {
    await addContact(page);
  });

  await test.step("find it by a part of the name: only it is left in the list", async () => {
    await page.getByRole("searchbox", { name: "Поиск по имени" }).fill("соколов");

    await expect(page).toHaveURL(/[?&]q=/);
    for (const name of KNOWN_PEOPLE) {
      await expect(page.getByRole("link", { name })).toHaveCount(0);
    }
    await page.getByRole("link", { name: NEW_CONTACT.name }).click();
    await expect(page.getByRole("heading", { level: 1, name: NEW_CONTACT.name })).toBeVisible();
  });

  await test.step("write a note after a talk", async () => {
    await addNote(page);
  });

  await test.step("the card keeps the contact and the note after a reload", async () => {
    await page.reload();

    await expect(page.getByRole("heading", { level: 1, name: NEW_CONTACT.name })).toBeVisible();
    await expect(page.getByText(NEW_CONTACT.about)).toBeVisible();
    await expect(page.getByText(NEW_CONTACT.howWeMet)).toBeVisible();
    await expect(page.getByRole("link", { name: NEW_CONTACT.phone })).toBeVisible();
    await expect(page.getByRole("link", { name: NEW_CONTACT.email })).toBeVisible();
    await expect(page.getByRole("list", { name: "1 заметка" })).toContainText(NOTE);
  });
});

test("another browser at the same address sees the same contacts", async ({ page, browser }) => {
  await insertContacts(KNOWN_PEOPLE);

  await test.step("the first browser adds a contact and a note", async () => {
    await addContact(page);
    await page.getByRole("link", { name: NEW_CONTACT.name }).click();
    await addNote(page);
  });

  const cardAddress = page.url();
  // A separate browser profile: no cookies, storage or cache in common with the first one, only the address
  const otherBrowser = await browser.newContext();
  try {
    const other = await otherBrowser.newPage();

    await test.step("the other browser sees the same list", async () => {
      await other.goto(new URL("/", cardAddress).href);

      await expect(other.getByText("3 контакта")).toBeVisible();
      for (const name of [...KNOWN_PEOPLE, NEW_CONTACT.name]) {
        await expect(other.getByRole("link", { name })).toBeVisible();
      }
    });

    await test.step("and the same card, with the note", async () => {
      await other.goto(cardAddress);

      await expect(other.getByRole("heading", { level: 1, name: NEW_CONTACT.name })).toBeVisible();
      await expect(other.getByRole("list", { name: "1 заметка" })).toContainText(NOTE);
    });
  } finally {
    await otherBrowser.close();
  }
});
