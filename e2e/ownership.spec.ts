// The success criterion of sign-in (openspec/changes/login/specs/data-ownership): every person sees only their
// own contacts. Two people, two browsers, real sign-in through letters from Mailpit.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { insertContact, insertContacts, insertUser, resetDatabase } from "./database";
import { signIn, uniqueEmail } from "./mailpit";

test.beforeEach(async () => {
  await resetDatabase();
});

// A person in a browser of their own, signed in
async function personInOwnBrowser(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return { page, close: () => context.close() };
}

async function addContact(page: Page, name: string) {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(name);
  await page.getByRole("button", { name: "Сохранить контакт" }).click();
  await expect(page.getByRole("status")).toContainText(`Контакт «${name}» добавлен`);
}

test("a contact of one person is not seen by another: not in the list, not in the search, not by its address", async ({
  browser,
}) => {
  const a = await personInOwnBrowser(browser, uniqueEmail("a"));
  const b = await personInOwnBrowser(browser, uniqueEmail("b"));
  try {
    await addContact(a.page, "Мария Соколова");
    await a.page.getByRole("link", { name: "Мария Соколова" }).click();
    await expect(a.page.getByRole("heading", { level: 1, name: "Мария Соколова" })).toBeVisible();
    const cardAddress = a.page.url();

    await test.step("A sees the contact in the list", async () => {
      await a.page.goto("/");
      await expect(a.page.getByText("1 контакт")).toBeVisible();
      await expect(a.page.getByRole("link", { name: "Мария Соколова" })).toBeVisible();
    });

    await test.step("B does not see it in the list", async () => {
      await b.page.goto("/");
      await expect(b.page.getByText("0 контактов")).toBeVisible();
      await expect(b.page.getByText("Мария Соколова")).toHaveCount(0);
    });

    await test.step("B does not find it by search", async () => {
      await b.page.getByRole("searchbox", { name: "Поиск по имени" }).fill("Соколова");
      await expect(b.page.getByText("Никого не нашли по запросу «Соколова»")).toBeVisible();
    });

    await test.step("B opens the address of A's card and gets «Контакт не найден»", async () => {
      await b.page.goto(cardAddress);
      await expect(b.page.getByRole("heading", { level: 1, name: "Контакт не найден" })).toBeVisible();
      await expect(b.page.getByText("Мария Соколова")).toHaveCount(0);
    });
  } finally {
    await a.close();
    await b.close();
  }
});

test("a person who signs in for the first time starts with an empty list while others have contacts", async ({
  browser,
}) => {
  const aEmail = uniqueEmail("a");
  const aId = await insertUser(aEmail);
  await insertContacts(aId, ["Анна Смирнова", "Борис Иванов", "Вера Ким"]);
  // A has something to reach out to, and a group
  await insertContact(aId, "Глеб Орлов", {
    frequency: "week",
    talkedAt: new Date(Date.now() - 100 * 86_400_000),
  });

  const a = await personInOwnBrowser(browser, aEmail);
  const b = await personInOwnBrowser(browser, uniqueEmail("b"));
  try {
    await a.page.goto("/groups");
    await a.page.getByLabel("Название новой группы").fill("Теннис");
    await a.page.getByRole("button", { name: "Создать" }).click();
    await expect(a.page.getByRole("link", { name: "Теннис" })).toBeVisible();
    await a.page.goto("/");
    await expect(a.page.getByRole("region", { name: "Пора связаться" })).toBeVisible();
    await expect(a.page.getByRole("navigation", { name: "Фильтр по группе" })).toBeVisible();

    await b.page.goto("/");

    await expect(b.page.getByText("0 контактов")).toBeVisible();
    await expect(b.page.getByText("Пока нет ни одного контакта.")).toBeVisible();
    await expect(b.page.getByRole("link", { name: "Добавить первый" })).toBeVisible();
    await expect(b.page.getByRole("region", { name: "Пора связаться" })).toHaveCount(0);
    await expect(b.page.getByRole("navigation", { name: "Фильтр по группе" })).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
