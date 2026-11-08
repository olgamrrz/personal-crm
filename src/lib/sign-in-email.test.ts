import { describe, expect, it } from "vitest";

import { buildSignInEmail } from "@/lib/sign-in-email";

const URL_WITH_QUERY = "https://crm.example.com/api/auth/magic-link/verify?token=abc123&callbackURL=%2F";

describe("buildSignInEmail", () => {
  it("has the subject «Вход в Личную CRM»", () => {
    expect(buildSignInEmail(URL_WITH_QUERY).subject).toBe("Вход в Личную CRM");
  });

  it("has a «Войти» button that leads to the link", () => {
    const { html } = buildSignInEmail(URL_WITH_QUERY);
    expect(html).toMatch(/<a [^>]*href="[^"]*magic-link\/verify[^"]*"[^>]*>\s*Войти\s*<\/a>/);
  });

  it("writes the & of the link as &amp; in HTML, so the link works", () => {
    const { html } = buildSignInEmail(URL_WITH_QUERY);
    expect(html).toContain("token=abc123&amp;callbackURL=%2F");
    expect(html).not.toContain("token=abc123&callbackURL");
  });

  it("says the link works 15 minutes and that a letter nobody asked for can be ignored", () => {
    const { html, text } = buildSignInEmail(URL_WITH_QUERY);
    for (const body of [html, text]) {
      expect(body).toContain("15 минут");
      expect(body).toContain("Если вы не запрашивали вход - просто проигнорируйте письмо");
    }
  });

  it("has the link in the plain text as it is", () => {
    expect(buildSignInEmail(URL_WITH_QUERY).text).toContain(URL_WITH_QUERY);
  });

  it("does not let a link break out of the HTML attribute", () => {
    const { html } = buildSignInEmail('https://crm.example.com/x?a="><script>alert(1)</script>');
    expect(html).not.toContain("<script>");
  });
});
