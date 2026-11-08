import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { sendMail } from "@/lib/mailer";
import { buildSignInEmail } from "@/lib/sign-in-email";

import { extractSignInLink, waitForEmails } from "../../test/mailpit";

const LINK = "http://127.0.0.1:3000/api/auth/magic-link/verify?token=abc123&callbackURL=%2F";

// Every test writes to an address of its own, so letters of other tests do not get mixed in
function uniqueAddress() {
  return `mailer-${randomUUID()}@example.com`;
}

describe("sendMail", () => {
  it("delivers the sign-in email to Mailpit from «Личная CRM»", async () => {
    const to = uniqueAddress();
    await sendMail({ to, ...buildSignInEmail(LINK) });

    const [email] = await waitForEmails(to);
    expect(email.fromName).toBe("Личная CRM");
    expect(email.fromAddress).toBe(process.env.MAIL_FROM);
    expect(email.subject).toBe("Вход в Личную CRM");
  });

  it("puts the button, the term and the hint into the delivered email", async () => {
    const to = uniqueAddress();
    await sendMail({ to, ...buildSignInEmail(LINK) });

    const [email] = await waitForEmails(to);
    expect(email.html).toMatch(/<a [^>]*href="[^"]*magic-link\/verify[^"]*"[^>]*>\s*Войти\s*<\/a>/);
    expect(email.html).toContain("15 минут");
    expect(email.html).toContain("Если вы не запрашивали вход - просто проигнорируйте письмо");
  });

  it("has the link in the plain text too", async () => {
    const to = uniqueAddress();
    await sendMail({ to, ...buildSignInEmail(LINK) });

    const [email] = await waitForEmails(to);
    expect(extractSignInLink(email)).toBe(LINK);
  });
});
