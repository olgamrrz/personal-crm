// Sign-in by a link from an email (openspec/changes/login/specs/user-login), in a real browser with real letters
// from Mailpit. A test uses an address of its own, so letters of other tests do not get mixed in.

import { expect, test, type Page } from "@playwright/test";

import { listEmails } from "../test/mailpit";

import {
  ageSignInLinks,
  countNotes,
  deleteSessions,
  getSignInTermEnd,
  insertContact,
  insertUser,
  listUsers,
  resetDatabase,
  setSignInTermDaysLeft,
} from "./database";
import { requestLink, signIn, signInLinks, uniqueEmail } from "./mailpit";

test.beforeEach(async () => {
  await resetDatabase();
});

async function submitEmail(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
}

test.describe("asking for a link", () => {
  test("a link is sent and the page says to which address", async ({ page }) => {
    const email = uniqueEmail("anna");

    await submitEmail(page, email);

    await expect(page.getByRole("status")).toHaveText(`Ссылка для входа отправлена на ${email}`);
    expect(await signInLinks(email)).toHaveLength(1);
  });

  test("the field stays on the page, so a link can be asked for again", async ({ page }) => {
    const email = uniqueEmail("anna");

    await requestLink(page, email);

    await expect(page.getByLabel("Почта")).toHaveValue(email);
  });

  test("the answer is the same for a known person and a new one", async ({ page }) => {
    const known = uniqueEmail("known");
    const unknown = uniqueEmail("unknown");
    await insertUser(known);

    await submitEmail(page, known);
    const forKnown = await page.getByRole("status").innerText();
    await submitEmail(page, unknown);
    const forUnknown = await page.getByRole("status").innerText();

    expect(forKnown).toBe(`Ссылка для входа отправлена на ${known}`);
    expect(forUnknown).toBe(`Ссылка для входа отправлена на ${unknown}`);
  });

  test("a mistake in the address is shown under the field and no letter is sent", async ({ page }) => {
    await submitEmail(page, "anna@");

    await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("an empty field is a mistake too", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Получить ссылку" }).click();

    await expect(page.getByText("Проверьте адрес почты")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
  });

  test("the fourth letter in 10 minutes is refused", async ({ page }) => {
    const email = uniqueEmail("anna");
    for (let sent = 1; sent <= 3; sent++) {
      await submitEmail(page, email);
      await expect(page.getByRole("status")).toContainText("Ссылка для входа отправлена");
    }

    await submitEmail(page, email);

    await expect(page.getByText("Слишком часто, попробуйте через несколько минут")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    expect(await signInLinks(email, 3)).toHaveLength(3);
    expect(await listEmails(email)).toHaveLength(3);
  });

  test("a link cannot be asked for by a request straight to Better Auth", async ({ request }) => {
    const email = uniqueEmail("anna");

    const response = await request.post("/api/auth/sign-in/magic-link", { data: { email } });

    expect(response.status()).toBe(404);
    expect(await listEmails(email)).toHaveLength(0);
  });
});

// Who the browser is signed in as, as the server sees it; null when nobody
async function signedInAs(page: Page) {
  const response = await page.request.get("/api/auth/get-session");
  const session = (await response.json()) as { user?: { email: string } } | null;
  return session?.user?.email ?? null;
}

test.describe("opening the link", () => {
  test("the link from the letter lets the person in: the home page opens", async ({ page }) => {
    const email = uniqueEmail("anna");
    await requestLink(page, email);
    const [link] = await signInLinks(email);

    await page.goto(link);

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    expect(await signedInAs(page)).toBe(email);
  });

  test("a new person is let in at once, without a name or other questions", async ({ page }) => {
    const email = uniqueEmail("boris");
    await requestLink(page, email);
    const [link] = await signInLinks(email);
    expect(await listUsers()).toHaveLength(0);

    await page.goto(link);

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    const people = await listUsers();
    expect(people).toHaveLength(1);
    expect(people[0].email).toBe(email);
  });

  test("spaces and capital letters in the address make the same person", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const [first] = await listUsers();

    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto("/login");
      await otherPage.getByLabel("Почта").fill(`  ${email.toUpperCase()}  `);
      await otherPage.getByRole("button", { name: "Получить ссылку" }).click();
      await expect(otherPage.getByRole("status")).toHaveText(`Ссылка для входа отправлена на ${email}`);
      const links = await signInLinks(email, 2);

      await otherPage.goto(links[1]);

      await expect(otherPage).toHaveURL("/");
      const people = await listUsers();
      expect(people).toHaveLength(1);
      expect(people[0].id).toBe(first.id);
    } finally {
      await other.close();
    }
  });

  test("the letter in the mail stub holds a link that lets the person in", async ({ page }) => {
    // Any address works locally: nothing reaches a real mailbox
    const email = uniqueEmail("test-b");

    await signIn(page, email);

    expect(await signedInAs(page)).toBe(email);
  });
});

test.describe("a link that does not work", () => {
  const EXPIRED = "Ссылка устарела, запросите новую";

  test("a link older than 15 minutes does not let in", async ({ page }) => {
    const email = uniqueEmail("anna");
    await requestLink(page, email);
    const [link] = await signInLinks(email);

    await ageSignInLinks(email, 16);
    await page.goto(link);

    await expect(page.getByText(EXPIRED)).toBeVisible();
    expect(await signedInAs(page)).toBeNull();
  });

  test("a link of 14 minutes still works", async ({ page }) => {
    const email = uniqueEmail("anna");
    await requestLink(page, email);
    const [link] = await signInLinks(email);

    await ageSignInLinks(email, 14);
    await page.goto(link);

    await expect(page).toHaveURL("/");
    expect(await signedInAs(page)).toBe(email);
  });

  test("a link opened for the second time does not let in", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    await requestLink(page, email);
    const [link] = await signInLinks(email);
    await page.goto(link);
    await expect(page).toHaveURL("/");

    // Another browser stands for «signed out and opened the same link again»
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(link);

      await expect(otherPage.getByText(EXPIRED)).toBeVisible();
      expect(await signedInAs(otherPage)).toBeNull();
    } finally {
      await other.close();
    }
  });

  test("the second link lets in, the first one does not", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    await requestLink(page, email);
    await requestLink(page, email);
    const [first, second] = await signInLinks(email, 2);

    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto(first);
      await expect(otherPage.getByText(EXPIRED)).toBeVisible();
    } finally {
      await other.close();
    }
    await page.goto(second);

    await expect(page).toHaveURL("/");
    expect(await signedInAs(page)).toBe(email);
  });

  test("a link with a changed letter does not let in and offers to get a new one", async ({ page }) => {
    const email = uniqueEmail("anna");
    await requestLink(page, email);
    const [link] = await signInLinks(email);
    const url = new URL(link);
    const token = url.searchParams.get("token")!;
    url.searchParams.set("token", `${token.startsWith("a") ? "b" : "a"}${token.slice(1)}`);

    await page.goto(url.href);

    await expect(page.getByText(EXPIRED)).toBeVisible();
    await expect(page.getByRole("link", { name: "Получить новую ссылку" })).toBeVisible();
    expect(await signedInAs(page)).toBeNull();
  });

  test("«Получить новую ссылку» opens the sign-in page", async ({ page }) => {
    await page.goto("/login/expired");

    await page.getByRole("link", { name: "Получить новую ссылку" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
  });
});

test.describe("without signing in", () => {
  test("any page opens the sign-in page, and there are no contacts", async ({ page }) => {
    await insertContact(await insertUser(uniqueEmail("someone")), "Мария Соколова");

    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(page.getByLabel("Почта")).toBeVisible();
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
    await expect(page.getByText("Мария Соколова")).toHaveCount(0);
  });

  test("a link to a card opens the sign-in page, and the card is not shown", async ({ page }) => {
    const id = await insertContact(await insertUser(uniqueEmail("someone")), "Мария Соколова");

    await page.goto(`/contacts/${id}`);

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
    await expect(page.getByText("Мария Соколова")).toHaveCount(0);
  });

  test("the groups page and the new contact form are closed too", async ({ page }) => {
    for (const path of ["/groups", "/contacts/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL("/login");
    }
  });

  test("the server answers /health without signing in", async ({ request }) => {
    const response = await request.get("/health");

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("a person who is signed in goes from the sign-in page to the home page", async ({ page }) => {
    await signIn(page, uniqueEmail("anna"));

    await page.goto("/login");

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
  });

  test("a sign-in that the server no longer knows opens the sign-in page", async ({ page }) => {
    await signIn(page, uniqueEmail("anna"));
    await deleteSessions();

    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
  });

  test("the server does not take a note from a person who is not signed in", async ({ page }) => {
    const email = uniqueEmail("anna");
    const id = await insertContact(await insertUser(email), "Мария Соколова");
    await signIn(page, email);
    await page.goto(`/contacts/${id}`);
    await page.getByRole("textbox", { name: "Новая заметка" }).fill("Не должна сохраниться");
    // The sign-in ends while the card is open, e.g. on another device
    await deleteSessions();

    await page.getByRole("button", { name: "Добавить заметку" }).click();

    await expect(page).toHaveURL("/login");
    expect(await countNotes()).toBe(0);
  });

  test("the server does not take a note from a browser without the sign-in cookie", async ({
    page,
    context,
  }) => {
    const email = uniqueEmail("anna");
    const id = await insertContact(await insertUser(email), "Мария Соколова");
    await signIn(page, email);
    await page.goto(`/contacts/${id}`);
    await page.getByRole("textbox", { name: "Новая заметка" }).fill("Не должна сохраниться");
    await context.clearCookies();

    await page.getByRole("button", { name: "Добавить заметку" }).click();

    await expect(page).toHaveURL("/login");
    expect(await countNotes()).toBe(0);
  });
});

test.describe("header and sign-out", () => {
  const DAY = 24 * 60 * 60_000;

  test("the header shows the address and «Выйти»", async ({ page }) => {
    const email = uniqueEmail("anna");

    await signIn(page, email);

    const header = page.getByRole("banner");
    await expect(header).toContainText(email);
    await expect(header.getByRole("button", { name: "Выйти" })).toBeVisible();
  });

  test("«Выйти» opens the sign-in page, and the contacts are closed again", async ({ page }) => {
    await insertContact(await insertUser(uniqueEmail("someone")), "Мария Соколова");
    await signIn(page, uniqueEmail("anna"));

    await page.getByRole("banner").getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL("/login");
    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
    await expect(page.getByText("Мария Соколова")).toHaveCount(0);
    await expect(page.getByRole("banner").getByRole("button", { name: "Выйти" })).toHaveCount(0);
  });

  test("signing out on one device keeps the other one signed in", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const phone = await browser.newContext();
    try {
      const phonePage = await phone.newPage();
      await signIn(phonePage, email);

      await page.getByRole("banner").getByRole("button", { name: "Выйти" }).click();
      await expect(page).toHaveURL("/login");

      await phonePage.goto("/");
      await expect(phonePage).toHaveURL("/");
      await expect(phonePage.getByRole("heading", { level: 1, name: "Контакты" })).toBeVisible();
    } finally {
      await phone.close();
    }
  });

  test("a second link on another device does not sign out the first one", async ({ page, browser }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const phone = await browser.newContext();
    try {
      await signIn(await phone.newPage(), email);

      await page.goto("/");

      await expect(page).toHaveURL("/");
      await expect(page.getByRole("banner")).toContainText(email);
    } finally {
      await phone.close();
    }
  });

  test("coming back every three weeks keeps the person signed in", async ({ page, context }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);
    const cookieEnds = async () =>
      (await context.cookies()).find((cookie) => cookie.name.includes("session_token"))!.expires;
    const signedInCookieEnd = await cookieEnds();

    // 20 days since the visit: 10 days of the term are left. The visit moves the end to 30 days from now.
    await setSignInTermDaysLeft(email, 10);
    await page.goto("/");
    await expect(page.getByRole("banner")).toContainText(email);
    await expect
      .poll(async () => (await getSignInTermEnd(email)).getTime() - Date.now())
      .toBeGreaterThan(29.9 * DAY);
    // The browser's cookie must live on too, or it would be thrown away 30 days after the sign-in
    await expect.poll(cookieEnds).toBeGreaterThan(signedInCookieEnd);

    // 20 more days: 40 days since the sign-in, and still inside
    await setSignInTermDaysLeft(email, 10);
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("banner")).toContainText(email);
    await expect
      .poll(async () => (await getSignInTermEnd(email)).getTime() - Date.now())
      .toBeGreaterThan(29.9 * DAY);
  });

  test("not coming for more than 30 days ends the sign-in", async ({ page }) => {
    const email = uniqueEmail("anna");
    await signIn(page, email);

    // 31 days since the visit: the term ended a day ago
    await setSignInTermDaysLeft(email, -1);
    await page.goto("/");

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Получить ссылку" })).toBeVisible();
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test("signing in and out work and nothing sticks out of the screen, even with a long address", async ({
    page,
  }) => {
    const email = uniqueEmail("a-very-long-address-of-a-person-with-a-long-name");
    const sticksOut = () =>
      page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

    await page.goto("/login");
    expect(await sticksOut()).toBe(false);

    await signIn(page, email);
    await expect(page.getByRole("banner")).toContainText("a-very-long-address");
    expect(await sticksOut()).toBe(false);
    await expect(page.getByRole("banner").getByRole("button", { name: "Выйти" })).toBeVisible();

    await page.getByRole("banner").getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL("/login");
    expect(await sticksOut()).toBe(false);
  });
});
