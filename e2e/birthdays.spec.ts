// Birthdays of contacts (openspec/changes/birthdays/specs/contact-birthdays/spec.md) in a real browser: the field in
// the new contact form and in the card, and the "Скоро день рождения" block on the home page. The parsing of the text
// and the counting of days are checked by the unit tests (src/lib/birthday.test.ts, src/lib/birthdays.test.ts); here
// are the screens and what the person sees.

import { expect, test, type Browser, type Page } from "@playwright/test";

import { addToGroup, insertContact, insertGroup, insertUser, resetDatabase } from "./database";
import { signIn, uniqueEmail } from "./mailpit";

const SAVE_FAILED = "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз.";

// Everything here happens after signing in; a test that needs a second browser signs in there under the same address
let email: string;
let userId: string;

test.beforeEach(async ({ page }) => {
  await resetDatabase();
  email = uniqueEmail();
  // The person exists before the test fills their contacts; signing in opens the same account
  userId = await insertUser(email);
  await signIn(page, email);
});

// The server counts "today" in Moscow, whatever the time zone of this machine, so the dates of the tests are
// counted from the Moscow day too: `offset` days from today (negative: in the past)
function moscowDay(offset: number) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + offset));
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear(), date };
}

// A date as the block shows it: "18 ноября"
function wordsDate(offset: number) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    moscowDay(offset).date,
  );
}

// A date as the card field shows it: "18.11"
function fieldDate(offset: number) {
  const { day, month } = moscowDay(offset);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
}

// The birthday that falls `offset` days from today, without a year or with the year of birth `born`.
// The year of the birthday itself is the one of that day, so "turning" is that year minus `born`.
function birthdayIn(offset: number, born?: number) {
  const { day, month } = moscowDay(offset);
  return { day, month, year: born ?? null };
}

function block(page: Page) {
  return page.getByRole("region", { name: "Скоро день рождения" });
}

function blockRow(page: Page, name: string) {
  return block(page).getByRole("listitem").filter({ hasText: name });
}

function blockNames(page: Page) {
  return block(page).getByRole("listitem").getByRole("link");
}

// The "День рождения" field of the contact card
function cardField(page: Page) {
  return page.getByRole("textbox", { name: "День рождения" });
}

// The "День рождения" field of the new contact form
function formField(page: Page) {
  return page.getByLabel("День рождения");
}

// Opens the card of a contact that is in the list of the home page
async function openCard(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("link", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

// Fills the form with a name and a birthday, saves, and opens the card of the new contact
async function addContactWithBirthday(page: Page, name: string, birthday: string) {
  await page.goto("/contacts/new");
  await page.getByLabel("Имя").fill(name);
  if (birthday) await formField(page).fill(birthday);
  await page.getByRole("button", { name: "Сохранить контакт" }).click();
  await expect(page.getByRole("status")).toContainText(`Контакт «${name}» добавлен`);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

// Waits until the server has answered a call of the page (a server action): the field shows the value at once,
// so a reload right after the key press could come before the save
function savedByServer(page: Page) {
  return page.waitForResponse((response) => response.request().method() === "POST");
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

test.describe("the field in the new contact form", () => {
  test("is after «Почта» and before «Группы», with a hint, and is not required", async ({ page }) => {
    await page.goto("/contacts/new");

    const labels = await page.locator("form label").allInnerTexts();
    const order = labels.map((label) => label.replace("*", "").trim());
    expect(order.slice(order.indexOf("Почта"))).toEqual(["Почта", "День рождения", "Группы"]);
    await expect(formField(page)).toHaveAttribute("placeholder", "Например: 14.03 или 14.03.1990");
    await expect(formField(page)).not.toHaveAttribute("required", "");
  });

  test("keeps a date with a year and shows it in the card", async ({ page }) => {
    await addContactWithBirthday(page, "Анна Смирнова", "14.03.1990");

    await expect(cardField(page)).toHaveValue("14.03.1990");
  });

  test("keeps a date without a year and shows it in the card", async ({ page }) => {
    await addContactWithBirthday(page, "Борис Иванов", "14.03");

    await expect(cardField(page)).toHaveValue("14.03");
  });

  test("shows the date with zeros when it was typed without them", async ({ page }) => {
    await addContactWithBirthday(page, "Вера Ким", "  5.3 ");

    await expect(cardField(page)).toHaveValue("05.03");
  });

  test("leaves the field in the card empty when no date was typed", async ({ page }) => {
    await addContactWithBirthday(page, "Глеб Орлов", "");

    await expect(cardField(page)).toHaveValue("");
  });

  test("does not create the contact when the date is wrong, and keeps what was typed", async ({ page }) => {
    await insertGroup(userId, "Теннис");
    await page.goto("/contacts/new");

    await page.getByLabel("Имя").fill("Дарья Белова");
    await page.getByLabel("Телефон").fill("+7 916 555-12-34");
    await page.getByLabel("Группы").click();
    await page.getByRole("option", { name: "Теннис" }).click();
    await page.keyboard.press("Escape");
    await formField(page).fill("31.04");
    await page.getByRole("button", { name: "Сохранить контакт" }).click();

    await expect(page.getByText("Такой даты нет")).toBeVisible();
    await expect(formField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(formField(page)).toBeFocused();
    await expect(page.getByLabel("Имя")).toHaveValue("Дарья Белова");
    await expect(page.getByLabel("Телефон")).toHaveValue("+7 916 555-12-34");
    await expect(formField(page)).toHaveValue("31.04");
    await expect(page.getByRole("button", { name: "Убрать из группы «Теннис»" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/contacts/new");

    await page.goto("/");
    await expect(page.getByText("0 контактов")).toBeVisible();
  });

  test("saves the contact once the date is corrected", async ({ page }) => {
    await page.goto("/contacts/new");
    await page.getByLabel("Имя").fill("Дарья Белова");
    await formField(page).fill("завтра");
    await page.getByRole("button", { name: "Сохранить контакт" }).click();
    await expect(page.getByText("Введите дату так: 14.03 или 14.03.1990")).toBeVisible();

    await formField(page).fill("14.03.1990");
    await page.getByRole("button", { name: "Сохранить контакт" }).click();

    await expect(page.getByRole("status")).toContainText("Контакт «Дарья Белова» добавлен");
  });

  test("has text of 16 px on a phone, so the browser does not zoom the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/contacts/new");

    await expect(formField(page)).toHaveCSS("font-size", "16px");
  });
});

test.describe("the row in the contact card", () => {
  test("is after «Почта» and before «Группы»", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    const labels = await page.getByRole("term").allInnerTexts();
    const order = labels.map((label) => label.trim());
    expect(order.slice(order.indexOf("Почта"), order.indexOf("Группы") + 1)).toEqual([
      "Почта",
      "День рождения",
      "Группы",
    ]);
  });

  test("is empty for a contact made before birthdays existed", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    await expect(cardField(page)).toHaveValue("");
  });

  test("shows the saved date", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: { day: 14, month: 3, year: 1990 } });
    await insertContact(userId, "Борис Иванов", { birthday: { day: 5, month: 3 } });

    await openCard(page, "Анна Смирнова");
    await expect(cardField(page)).toHaveValue("14.03.1990");

    await openCard(page, "Борис Иванов");
    await expect(cardField(page)).toHaveValue("05.03");
  });

  test("saves the date at once on Enter", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    const saved = savedByServer(page);
    await cardField(page).fill("14.03.1990");
    await cardField(page).press("Enter");
    await saved;
    await page.reload();

    await expect(cardField(page)).toHaveValue("14.03.1990");
  });

  test("saves the date when the cursor leaves the field", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    const saved = savedByServer(page);
    await cardField(page).fill("14.03");
    await page.getByRole("textbox", { name: "Новая заметка" }).click();
    await saved;
    await page.reload();

    await expect(cardField(page)).toHaveValue("14.03");
  });

  test("shows the date in its saved form: with zeros", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    await cardField(page).fill("  5.3 ");
    await cardField(page).press("Enter");

    await expect(cardField(page)).toHaveValue("05.03");
  });

  test("changes the date", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: { day: 14, month: 3 } });
    await openCard(page, "Анна Смирнова");

    const saved = savedByServer(page);
    await cardField(page).fill("15.03");
    await cardField(page).press("Enter");
    await saved;
    await page.reload();

    await expect(cardField(page)).toHaveValue("15.03");
  });

  test("removes the date when the field is cleared", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: { day: 14, month: 3, year: 1990 } });
    await openCard(page, "Анна Смирнова");

    const saved = savedByServer(page);
    await cardField(page).fill("");
    await cardField(page).press("Enter");
    await saved;
    await page.reload();

    await expect(cardField(page)).toHaveValue("");
  });

  test("does not call the server when nothing has changed", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: { day: 14, month: 3 } });
    await openCard(page, "Анна Смирнова");
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") calls.push(request.url());
    });

    await cardField(page).focus();
    await cardField(page).press("Enter");
    await page.getByRole("textbox", { name: "Новая заметка" }).click();
    // Typing the same text again is not a change either
    await cardField(page).fill("14.03");
    await cardField(page).press("Enter");
    await page.waitForTimeout(500);

    expect(calls).toEqual([]);
  });

  test("shows the same date in another browser", async ({ page, browser }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");
    const cardAddress = page.url();

    const saved = savedByServer(page);
    await cardField(page).fill("14.03");
    await cardField(page).press("Enter");
    await saved;

    // A separate browser profile: no cookies, storage or cache in common with the first one, only the address
    const otherBrowser = await browser.newContext();
    try {
      const other = await otherBrowser.newPage();
      await signIn(other, email);
      await other.goto(cardAddress);

      await expect(cardField(other)).toHaveValue("14.03");
    } finally {
      await otherBrowser.close();
    }
  });

  test("says what is wrong with a wrong date, keeps the text and the saved date", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: { day: 14, month: 3 } });
    await openCard(page, "Анна Смирнова");

    await cardField(page).fill("31.04");
    await cardField(page).press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: "Такой даты нет" })).toBeVisible();
    await expect(cardField(page)).toHaveAttribute("aria-invalid", "true");
    await expect(cardField(page)).toHaveValue("31.04");
    await page.reload();
    await expect(cardField(page)).toHaveValue("14.03");
  });

  test("clears the message once the date is corrected", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");
    await cardField(page).fill("завтра");
    await cardField(page).press("Enter");
    await expect(page.getByText("Введите дату так: 14.03 или 14.03.1990")).toBeVisible();

    await cardField(page).fill("14.03");
    await cardField(page).press("Enter");

    await expect(cardField(page)).toHaveValue("14.03");
    await expect(page.getByText("Введите дату так: 14.03 или 14.03.1990")).toHaveCount(0);
  });

  test("tells about a failed save and goes back to the saved date", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: { day: 14, month: 3 } });
    await openCard(page, "Анна Смирнова");

    await cutConnectionToServer(page);
    await cardField(page).fill("15.03");
    await cardField(page).press("Enter");

    await expect(page.getByRole("alert").filter({ hasText: SAVE_FAILED })).toBeVisible();
    await expect(cardField(page)).toHaveValue("14.03");
  });

  test("labels the field and ties the message to it", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    await cardField(page).fill("31.04");
    await cardField(page).press("Enter");

    const message = page.getByRole("alert").filter({ hasText: "Такой даты нет" });
    await expect(message).toBeVisible();
    const messageId = await message.getAttribute("id");
    await expect(cardField(page)).toHaveAttribute("aria-describedby", messageId ?? "");
  });

  test("has text of 16 px on a phone, so the browser does not zoom the page", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    await expect(cardField(page)).toHaveCSS("font-size", "16px");
  });
});

test.describe("the «Скоро день рождения» block on the home page", () => {
  test("shows the birthdays of the coming 7 days, the nearest first, with the day and when it is", async ({
    page,
  }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(6) });
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(1) });
    await insertContact(userId, "Вера Ким", { birthday: birthdayIn(0) });
    await insertContact(userId, "Глеб Орлов", { birthday: birthdayIn(7) });
    await insertContact(userId, "Дарья Белова", { birthday: birthdayIn(-1) });
    await insertContact(userId, "Егор Попов");

    await page.goto("/");

    await expect(block(page).getByText("(3)", { exact: true })).toBeVisible();
    await expect(blockNames(page)).toHaveCount(3);
    await expect(blockNames(page).nth(0)).toContainText("Вера Ким");
    await expect(blockNames(page).nth(1)).toContainText("Борис Иванов");
    await expect(blockNames(page).nth(2)).toContainText("Анна Смирнова");

    await expect(blockRow(page, "Вера Ким")).toContainText(wordsDate(0));
    await expect(blockRow(page, "Вера Ким")).toContainText("сегодня");
    await expect(blockRow(page, "Борис Иванов")).toContainText(wordsDate(1));
    await expect(blockRow(page, "Борис Иванов")).toContainText("завтра");
    await expect(blockRow(page, "Анна Смирнова")).toContainText(wordsDate(6));
    await expect(blockRow(page, "Анна Смирнова")).toContainText("через 6 дней");

    // Not soon: in 7 days, yesterday (the next one is a year away), and no date at all
    await expect(blockRow(page, "Глеб Орлов")).toHaveCount(0);
    await expect(blockRow(page, "Дарья Белова")).toHaveCount(0);
    await expect(blockRow(page, "Егор Попов")).toHaveCount(0);
  });

  test("goes by name when two birthdays are on the same day", async ({ page }) => {
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(2) });
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(2) });

    await page.goto("/");

    await expect(blockNames(page).nth(0)).toContainText("Анна Смирнова");
    await expect(blockNames(page).nth(1)).toContainText("Борис Иванов");
    await expect(blockRow(page, "Анна Смирнова")).toContainText("через 2 дня");
  });

  test("tells how old they turn when the year is known, and says nothing when it is not", async ({
    page,
  }) => {
    const born = 1990;
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(3, born) });
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(3) });

    await page.goto("/");

    await expect(blockRow(page, "Анна Смирнова")).toContainText(`исполняется ${moscowDay(3).year - born}`);
    await expect(blockRow(page, "Борис Иванов")).toBeVisible();
    await expect(blockRow(page, "Борис Иванов")).not.toContainText("исполняется");
  });

  test("opens the card of the contact when the row is pressed", async ({ page }) => {
    const id = await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(3) });
    await page.goto("/");

    await blockRow(page, "Анна Смирнова").getByRole("link").click();

    await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Анна Смирнова" })).toBeVisible();
  });

  test("has no buttons in a row: the only thing to do is to open the card", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(3) });
    await page.goto("/");

    await expect(block(page).getByRole("button")).toHaveCount(0);
    await expect(blockRow(page, "Анна Смирнова").getByRole("link")).toHaveCount(1);
  });

  test("is not on the page when there are no birthdays soon", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(7) });
    await insertContact(userId, "Борис Иванов");

    await page.goto("/");

    await expect(page.getByText("2 контакта")).toBeVisible();
    await expect(block(page)).toHaveCount(0);
    await expect(page.getByText("Скоро день рождения")).toHaveCount(0);
  });

  test("stays the same while searching, and the list below shows the results", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(1) });
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(2) });
    await insertContact(userId, "Вера Ким");
    await page.goto("/");
    await expect(blockNames(page)).toHaveCount(2);

    await page.getByRole("searchbox", { name: "Поиск по имени" }).fill("Ким");

    await expect(page.getByText("Найдено: 1")).toBeVisible();
    await expect(blockNames(page)).toHaveCount(2);
    await expect(block(page).getByText("(2)", { exact: true })).toBeVisible();
  });

  test("stays the same when a group is chosen, and the list below shows the group", async ({ page }) => {
    const tennis = await insertGroup(userId, "Теннис");
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(1) });
    const boris = await insertContact(userId, "Борис Иванов");
    await addToGroup(boris, tennis);
    await page.goto("/");

    await page
      .getByRole("navigation", { name: "Фильтр по группе" })
      .getByRole("link", { name: "Теннис" })
      .click();

    await expect(page).toHaveURL(/group=/);
    await expect(page.getByText("1 контакт")).toBeVisible();
    await expect(blockRow(page, "Анна Смирнова")).toBeVisible();
    // Анна is in the block only: the list below holds Борис, the only one in the group
    await expect(page.getByRole("link", { name: "Анна Смирнова" })).toHaveCount(1);
  });

  test("drops a contact whose date was changed to a far one", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(2) });
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(3) });
    await page.goto("/");
    await blockRow(page, "Анна Смирнова").getByRole("link").click();

    const saved = savedByServer(page);
    await cardField(page).fill(fieldDate(100));
    await cardField(page).press("Enter");
    await saved;
    await page.getByRole("link", { name: "Все контакты" }).click();

    await expect(block(page).getByText("(1)", { exact: true })).toBeVisible();
    await expect(blockRow(page, "Анна Смирнова")).toHaveCount(0);
    await expect(blockRow(page, "Борис Иванов")).toBeVisible();
  });

  test("takes in a contact whose date was set to a near one", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова");
    await openCard(page, "Анна Смирнова");

    const saved = savedByServer(page);
    await cardField(page).fill(fieldDate(1));
    await cardField(page).press("Enter");
    await saved;
    await page.getByRole("link", { name: "Все контакты" }).click();

    await expect(blockRow(page, "Анна Смирнова")).toContainText("завтра");
  });

  test("drops a contact that was deleted", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(2) });
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(3) });
    await page.goto("/");
    await blockRow(page, "Анна Смирнова").getByRole("link").click();

    await page.getByRole("button", { name: "Удалить контакт" }).click();
    await page.getByRole("button", { name: "Удалить", exact: true }).click();

    await expect(page.getByText("Контакт удалён.")).toBeVisible();
    await expect(block(page).getByText("(1)", { exact: true })).toBeVisible();
    await expect(blockRow(page, "Анна Смирнова")).toHaveCount(0);
  });

  test("is under «Пора связаться» and above the search", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", {
      frequency: "week",
      talkedAt: new Date(Date.now() - 100 * 86_400_000),
    });
    await insertContact(userId, "Борис Иванов", { birthday: birthdayIn(2) });
    await page.goto("/");

    const overdue = page.getByRole("region", { name: "Пора связаться" });
    await expect(overdue).toBeVisible();
    await expect(block(page)).toBeVisible();
    const overdueBox = await overdue.boundingBox();
    const birthdaysBox = await block(page).boundingBox();
    const searchBox = await page.getByRole("searchbox", { name: "Поиск по имени" }).boundingBox();
    expect(overdueBox && birthdaysBox && searchBox).toBeTruthy();
    expect(overdueBox!.y + overdueBox!.height).toBeLessThanOrEqual(birthdaysBox!.y);
    expect(birthdaysBox!.y + birthdaysBox!.height).toBeLessThanOrEqual(searchBox!.y);
  });

  test("is not touched by «Пообщались» in «Пора связаться»", async ({ page }) => {
    await insertContact(userId, "Анна Смирнова", {
      frequency: "week",
      talkedAt: new Date(Date.now() - 100 * 86_400_000),
      birthday: birthdayIn(2),
    });
    await page.goto("/");

    await page.getByRole("button", { name: "Пообщались: Анна Смирнова" }).click();

    await expect(page.getByRole("region", { name: "Пора связаться" })).toHaveCount(0);
    await expect(blockRow(page, "Анна Смирнова")).toBeVisible();
  });

  test("has rows at least 44 px high on a phone, and the text fits", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(6, 1950) });
    await insertContact(userId, "Борис Иванов-Петров-Сидоров-Кузнецов-Васильев", { birthday: birthdayIn(0) });
    await page.goto("/");

    await expect(block(page).getByRole("listitem")).toHaveCount(2);
    for (const row of await block(page).getByRole("listitem").all()) {
      const box = await row.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    // The page does not scroll sideways
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("birthdays of other people", () => {
  // A person in a browser of their own, signed in
  async function personInOwnBrowser(browser: Browser, address: string) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, address);
    return { page, close: () => context.close() };
  }

  test("are not in the block of another person, and their card cannot be opened", async ({
    page,
    browser,
  }) => {
    const id = await insertContact(userId, "Анна Смирнова", { birthday: birthdayIn(0, 1990) });
    await page.goto("/");
    await expect(blockRow(page, "Анна Смирнова")).toBeVisible();

    const other = await personInOwnBrowser(browser, uniqueEmail("other"));
    try {
      await other.page.goto("/");
      await expect(other.page.getByText("0 контактов")).toBeVisible();
      await expect(block(other.page)).toHaveCount(0);

      await other.page.goto(`/contacts/${id}`);
      await expect(other.page.getByRole("heading", { level: 1, name: "Контакт не найден" })).toBeVisible();
      await expect(cardField(other.page)).toHaveCount(0);
      await expect(other.page.getByText("Анна Смирнова")).toHaveCount(0);
    } finally {
      await other.close();
    }

    // The owner still has the date
    await page.goto(`/contacts/${id}`);
    await expect(cardField(page)).toHaveValue(`${fieldDate(0)}.1990`);
  });
});
