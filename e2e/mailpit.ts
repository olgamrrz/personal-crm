// Sign-in for the browser tests: through the real sign-in page and a real letter from Mailpit, no shortcuts.

import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { extractSignInLink, waitForEmails } from "../test/mailpit";

// Every test signs in under an address of its own, so letters of other tests do not get mixed in
export function uniqueEmail(prefix = "e2e") {
  return `${prefix}-${randomUUID()}@example.com`;
}

// The links of all the letters sent to the address, the oldest first
export async function signInLinks(email: string, count = 1) {
  return (await waitForEmails(email, count)).map(extractSignInLink);
}

// Asks for a link on the sign-in page and returns once the page says it is sent
export async function requestLink(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText("Ссылка для входа отправлена");
}

// Signs in the way a person does: asks for a link, opens the newest one from the letter. Ends on the home page.
export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Почта").fill(email);
  await page.getByRole("button", { name: "Получить ссылку" }).click();
  await expect(page.getByRole("status")).toContainText(`Ссылка для входа отправлена на ${email}`);

  const sent = (await waitForEmails(email)).length;
  const links = await signInLinks(email, sent);
  await page.goto(links[links.length - 1]);
  await expect(page).toHaveURL("/");
}
