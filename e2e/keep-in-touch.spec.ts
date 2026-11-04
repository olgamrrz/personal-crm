// Keep in touch (openspec/specs/keep-in-touch/spec.md) in a real browser: the main paths of the user and what
// they see when the connection to the server is lost. The calculation of due days and the order of the block
// are checked by the unit tests in src/lib/keep-in-touch.test.ts.

import { expect, test, type Page } from "@playwright/test";

import { insertContact, resetDatabase } from "./database";

const SAVE_FAILED = "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.";
const MARK_FAILED = "Не удалось отметить. Проверьте интернет и попробуйте ещё раз.";

// The server counts from its own clock, so the history is counted back from now:
// a month frequency with a note 100 days ago is overdue, with a note 3 days ago it is not
function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// The way the card shows the day of the last conversation, e.g. "19 сентября 2026 г."
function moscowDay(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Moscow",
  }).format(date);
}

test.beforeEach(async () => {
  await resetDatabase();
});

function block(page: Page) {
  return page.getByRole("region", { name: "Пора связаться" });
}

function blockRow(page: Page, name: string) {
  return block(page).getByRole("listitem").filter({ hasText: name });
}

// Its text also holds the "▼" of the arrow icon (not shown), so checks look for the option in it
function frequencySelect(page: Page) {
  return page.getByRole("combobox", { name: "Как часто общаться" });
}

// The value of the "Как часто общаться" row of the card: the select and the message under it
function frequencyRow(page: Page) {
  return page.getByRole("definition").filter({ has: frequencySelect(page) });
}

// The value of the "Последнее общение" row of the card: the text and the "Пообщались" button
function lastConversation(page: Page) {
  return page.getByRole("definition").filter({ has: page.getByRole("button", { name: "Пообщались" }) });
}

function lastConversationLabel(page: Page) {
  return page.getByRole("term").filter({ hasText: "Последнее общение" });
}

// Chooses an option in the card and waits until the server has saved it: the page shows the choice at once,
// so a reload right after the click could come before the save
async function chooseFrequency(page: Page, label: string) {
  await frequencySelect(page).click();
  const saved = page.waitForResponse((response) => response.request().method() === "POST");
  await page.getByRole("option", { name: label, exact: true }).click();
  await saved;
}

// Like a lost connection: the app's calls to the server (server actions) fail in the browser and never reach
// the server. The server and the database stay real; pages and their files still load.
async function cutConnectionToServer(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && (await request.headerValue("next-action")) !== null) {
      await route.abort("internetdisconnected");
    } else {
      await route.fallback();
    }
  });
}

async function restoreConnectionToServer(page: Page) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
}

test("«Пообщались» in the block takes the contact out of it, and the block goes when it is empty", async ({
  page,
}) => {
  const ivanId = await insertContact("Иван Петров", { frequency: "month", talkedAt: daysAgo(100) });
  await insertContact("Анна Смирнова", { frequency: "week", talkedAt: daysAgo(100) });
  await insertContact("Борис Иванов", { frequency: "year", talkedAt: daysAgo(400) });
  await insertContact("Вера Ким", { frequency: "month", talkedAt: daysAgo(3) });
  await insertContact("Глеб Орлов", { talkedAt: daysAgo(400) });

  await test.step("the block shows the overdue contacts only, with the number in the title", async () => {
    await page.goto("/");

    await expect(block(page).getByText("(3)", { exact: true })).toBeVisible();
    await expect(block(page).getByRole("listitem")).toHaveCount(3);
    await expect(blockRow(page, "Вера Ким")).toHaveCount(0);
    await expect(blockRow(page, "Глеб Орлов")).toHaveCount(0);

    const ivan = blockRow(page, "Иван Петров");
    await expect(ivan).toContainText("раз в месяц");
    await expect(ivan).toContainText(/просрочено на \d+ (день|дня|дней)/);
    await expect(ivan.getByRole("button", { name: "Пообщались: Иван Петров" })).toBeVisible();
  });

  await test.step("«Пообщались» at Иван: the row goes, the number drops, the page stays", async () => {
    await block(page).getByRole("button", { name: "Пообщались: Иван Петров" }).click();

    await expect(blockRow(page, "Иван Петров")).toHaveCount(0);
    await expect(block(page).getByText("(2)", { exact: true })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/");
  });

  await test.step("after a reload Иван is still not in the block", async () => {
    await page.reload();

    await expect(block(page).getByText("(2)", { exact: true })).toBeVisible();
    await expect(blockRow(page, "Иван Петров")).toHaveCount(0);
  });

  await test.step("the last ones marked: the block goes, the search comes right under the title", async () => {
    await block(page).getByRole("button", { name: "Пообщались: Анна Смирнова" }).click();
    await expect(blockRow(page, "Анна Смирнова")).toHaveCount(0);
    await block(page).getByRole("button", { name: "Пообщались: Борис Иванов" }).click();

    await expect(block(page)).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Поиск по имени" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Поиск по имени" })).toBeVisible();
    await expect(block(page)).toHaveCount(0);
  });

  await test.step("«Пообщались» added no note", async () => {
    await page.goto(`/contacts/${ivanId}`);

    await expect(page.getByRole("list", { name: "1 заметка" })).toBeVisible();
  });
});

test("a row of the block opens the card, and «Пообщались» there makes it today", async ({ page }) => {
  const talkedAt = daysAgo(100);
  await insertContact("Мария Соколова", { frequency: "month", talkedAt });

  await test.step("a press on the row, not on the button, opens the card", async () => {
    await page.goto("/");
    await block(page)
      .getByRole("link", { name: /Мария Соколова/ })
      .click();

    await expect(page.getByRole("heading", { level: 1, name: "Мария Соколова" })).toBeVisible();
  });

  await test.step("the card shows the day of the last note", async () => {
    await expect(lastConversationLabel(page)).toBeVisible();
    await expect(lastConversation(page)).toContainText(moscowDay(talkedAt));
  });

  await test.step("«Пообщались» in the card: today, and no new note", async () => {
    await lastConversation(page).getByRole("button", { name: "Пообщались" }).click();

    await expect(lastConversation(page)).toContainText("сегодня");
    await expect(page.getByRole("list", { name: "1 заметка" })).toBeVisible();
  });

  await test.step("the home page has no block any more", async () => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Мария Соколова" })).toBeVisible();
    await expect(block(page)).toHaveCount(0);
  });
});

test("the frequency is chosen in the card, saved at once and reset", async ({ page, browser }) => {
  await test.step("a new contact has no frequency, so no last conversation either", async () => {
    await page.goto("/contacts/new");
    await page.getByLabel("Имя").fill("Мария Соколова");
    await page.getByRole("button", { name: "Сохранить контакт" }).click();
    await page.getByRole("status").getByRole("link", { name: "Открыть карточку" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Мария Соколова" })).toBeVisible();
    await expect(frequencySelect(page)).toContainText("не задано");
    await expect(lastConversationLabel(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Пообщались" })).toHaveCount(0);
  });

  await test.step("a chosen frequency brings the last conversation and the button", async () => {
    await chooseFrequency(page, "раз в месяц");

    await expect(frequencySelect(page)).toContainText("раз в месяц");
    await expect(lastConversationLabel(page)).toBeVisible();
    await expect(lastConversation(page)).toContainText("ещё не общались");
  });

  await test.step("the frequency is kept after a reload", async () => {
    await page.reload();

    await expect(frequencySelect(page)).toContainText("раз в месяц");
  });

  await test.step("another browser sees the same frequency", async () => {
    // A separate browser profile: no cookies, storage or cache in common with the first one, only the address
    const otherBrowser = await browser.newContext();
    try {
      const other = await otherBrowser.newPage();
      await other.goto(page.url());

      await expect(frequencySelect(other)).toContainText("раз в месяц");
    } finally {
      await otherBrowser.close();
    }
  });

  await test.step("«не задано» takes the last conversation and the button away", async () => {
    await chooseFrequency(page, "не задано");

    await expect(lastConversationLabel(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Пообщались" })).toHaveCount(0);
    await page.reload();
    await expect(frequencySelect(page)).toContainText("не задано");
    await expect(lastConversationLabel(page)).toHaveCount(0);
  });
});

test("a note or a reset frequency takes the contact out of the block", async ({ page }) => {
  const annaId = await insertContact("Анна Смирнова", { frequency: "month", talkedAt: daysAgo(100) });
  const borisId = await insertContact("Борис Иванов", { frequency: "month", talkedAt: daysAgo(100) });

  await test.step("both are in the block", async () => {
    await page.goto("/");

    await expect(block(page).getByText("(2)", { exact: true })).toBeVisible();
  });

  await test.step("a note to Анна takes her out of the block", async () => {
    await page.goto(`/contacts/${annaId}`);
    await page.getByRole("textbox", { name: "Новая заметка" }).fill("Обсудили поездку");
    await page.getByRole("button", { name: "Добавить заметку" }).click();
    await expect(page.getByRole("list", { name: "2 заметки" })).toContainText("Обсудили поездку");

    await page.goto("/");

    await expect(block(page).getByText("(1)", { exact: true })).toBeVisible();
    await expect(blockRow(page, "Анна Смирнова")).toHaveCount(0);
    await expect(blockRow(page, "Борис Иванов")).toBeVisible();
  });

  await test.step("«не задано» for Борис takes him out too, and the block goes", async () => {
    await page.goto(`/contacts/${borisId}`);
    await chooseFrequency(page, "не задано");

    await page.goto("/");

    await expect(page.getByRole("link", { name: "Борис Иванов" })).toBeVisible();
    await expect(block(page)).toHaveCount(0);
  });
});

test("the search does not change the block", async ({ page }) => {
  await insertContact("Анна Смирнова", { frequency: "month", talkedAt: daysAgo(100) });
  await insertContact("Борис Иванов", { frequency: "week", talkedAt: daysAgo(100) });
  await insertContact("Вера Ким");

  await page.goto("/");
  await page.getByRole("searchbox", { name: "Поиск по имени" }).fill("Вера");

  await expect(page).toHaveURL(/[?&]q=/);
  await expect(page.getByText("Найдено: 1")).toBeVisible();
  // The list under the search: Вера is not in the block, so the list with her is the contact list
  const contactList = page.getByRole("list").filter({ hasText: "Вера Ким" });
  await expect(contactList.getByRole("link")).toHaveCount(1);
  await expect(block(page).getByText("(2)", { exact: true })).toBeVisible();
  await expect(blockRow(page, "Анна Смирнова")).toBeVisible();
  await expect(blockRow(page, "Борис Иванов")).toBeVisible();
});

test("a frequency that could not be saved says so and goes back", async ({ page }) => {
  const mariaId = await insertContact("Мария Соколова", { frequency: "month" });
  await page.goto(`/contacts/${mariaId}`);
  await expect(frequencySelect(page)).toContainText("раз в месяц");

  await cutConnectionToServer(page);
  await frequencySelect(page).click();
  await page.getByRole("option", { name: "раз в неделю" }).click();

  await expect(frequencyRow(page).getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(frequencySelect(page)).toContainText("раз в месяц");

  await restoreConnectionToServer(page);
  await page.reload();
  await expect(frequencySelect(page)).toContainText("раз в месяц");
});

test("a mark in the block that could not be saved keeps the row and says so", async ({ page }) => {
  await insertContact("Иван Петров", { frequency: "month", talkedAt: daysAgo(100) });
  await page.goto("/");

  await cutConnectionToServer(page);
  await block(page).getByRole("button", { name: "Пообщались: Иван Петров" }).click();

  await expect(blockRow(page, "Иван Петров").getByRole("alert")).toHaveText(MARK_FAILED);
  await expect(block(page).getByText("(1)", { exact: true })).toBeVisible();

  await restoreConnectionToServer(page);
  await page.reload();
  await expect(blockRow(page, "Иван Петров")).toBeVisible();
});

test("a mark in the card that could not be saved says so and keeps the last conversation", async ({
  page,
}) => {
  const talkedAt = daysAgo(100);
  const mariaId = await insertContact("Мария Соколова", { frequency: "month", talkedAt });
  await page.goto(`/contacts/${mariaId}`);
  await expect(lastConversation(page)).toContainText(moscowDay(talkedAt));

  await cutConnectionToServer(page);
  await lastConversation(page).getByRole("button", { name: "Пообщались" }).click();

  await expect(lastConversation(page).getByRole("alert")).toHaveText(MARK_FAILED);
  await expect(lastConversation(page)).toContainText(moscowDay(talkedAt));
  await expect(lastConversation(page)).not.toContainText("сегодня");

  await restoreConnectionToServer(page);
  await page.reload();
  await expect(lastConversation(page)).toContainText(moscowDay(talkedAt));
});
