import { randomUUID } from "node:crypto";

import { count } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { signInEmails } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requestSignInLink } from "@/lib/sign-in";

import { extractSignInLink, listEmails, waitForEmails } from "../../test/mailpit";

// Every test writes to addresses of its own, so letters of other tests do not get mixed in
function uniqueAddress() {
  return `sign-in-${randomUUID()}@example.com`;
}

const MINUTE = 60_000;

// Opens a link from a letter the way a browser does and tells where it leads: "/" means the person is in
async function openLink(link: string) {
  const response = await auth.handler(new Request(link));
  const location = response.headers.get("location");
  return {
    goesTo: location ? new URL(location).pathname : null,
    signedIn: response.headers.has("set-cookie"),
  };
}

async function linksOf(email: string, count: number) {
  return (await waitForEmails(email, count)).map(extractSignInLink);
}

// Marks letters as sent `minutesAgo` minutes ago: time is moved in the database, not waited for
async function recordSentEmails(email: string, minutesAgo: number[]) {
  await db
    .insert(signInEmails)
    .values(minutesAgo.map((minutes) => ({ email, sentAt: new Date(Date.now() - minutes * MINUTE) })));
}

describe("requestSignInLink", () => {
  it("sends a letter and says to which address", async () => {
    const email = uniqueAddress();
    const result = await requestSignInLink(email);

    expect(result).toEqual({ success: true, email });
    expect(await waitForEmails(email)).toHaveLength(1);
  });

  it("brings the address to one form: no spaces at the ends, lower case", async () => {
    const email = uniqueAddress();
    const result = await requestSignInLink(`  ${email.toUpperCase()}  `);

    expect(result).toEqual({ success: true, email });
    expect(await waitForEmails(email)).toHaveLength(1);
  });

  describe("limit of letters", () => {
    it("lets three letters through and stops the fourth", async () => {
      const email = uniqueAddress();
      for (let sent = 1; sent <= 3; sent++) {
        expect(await requestSignInLink(email)).toEqual({ success: true, email });
      }

      expect(await requestSignInLink(email)).toEqual({
        success: false,
        message: "Слишком часто, попробуйте через несколько минут",
      });
      expect(await waitForEmails(email, 3)).toHaveLength(3);
      // Give a wrongly sent fourth letter time to arrive
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(await listEmails(email)).toHaveLength(3);
    });

    it("counts every address on its own", async () => {
      const anna = uniqueAddress();
      const boris = uniqueAddress();
      await recordSentEmails(anna, [1, 2, 3]);

      expect(await requestSignInLink(anna)).toMatchObject({ success: false });
      expect(await requestSignInLink(boris)).toEqual({ success: true, email: boris });
    });

    it("counts letters of the last 10 minutes only", async () => {
      const email = uniqueAddress();
      await recordSentEmails(email, [11, 12, 9]);

      expect(await requestSignInLink(email)).toEqual({ success: true, email });
    });

    it("lets the next letter through when the first of three is older than 10 minutes", async () => {
      const email = uniqueAddress();
      await recordSentEmails(email, [10.5, 5, 1]);

      expect(await requestSignInLink(email)).toEqual({ success: true, email });
    });

    it("forgets letters older than 10 minutes", async () => {
      const email = uniqueAddress();
      await recordSentEmails(email, [11, 60]);

      await requestSignInLink(email);

      const [{ total }] = await db.select({ total: count() }).from(signInEmails);
      expect(total).toBe(1);
    });
  });

  describe("wrong address", () => {
    it.each(["", "   ", "anna@", "anna", "an na@example.com", `${"a".repeat(250)}@example.com`])(
      "refuses «%s»: no letter, not counted in the limit",
      async (input) => {
        expect(await requestSignInLink(input)).toEqual({ success: false, message: "Проверьте адрес почты" });

        const [{ total }] = await db.select({ total: count() }).from(signInEmails);
        expect(total).toBe(0);
      },
    );

    it("refuses a value that is not text", async () => {
      expect(await requestSignInLink(undefined)).toEqual({
        success: false,
        message: "Проверьте адрес почты",
      });
      expect(await requestSignInLink({ email: "anna@example.com" })).toMatchObject({ success: false });
    });
  });

  describe("old links", () => {
    it("a new link switches off the old ones of this email only", async () => {
      const anna = uniqueAddress();
      const boris = uniqueAddress();
      await requestSignInLink(anna);
      await requestSignInLink(boris);
      await requestSignInLink(anna);

      const [annaFirst, annaSecond] = await linksOf(anna, 2);
      const [borisLink] = await linksOf(boris, 1);
      expect(await openLink(annaFirst)).toEqual({ goesTo: "/login/expired", signedIn: false });
      expect(await openLink(annaSecond)).toEqual({ goesTo: "/", signedIn: true });
      expect(await openLink(borisLink)).toEqual({ goesTo: "/", signedIn: true });
    });

    it("a link works once", async () => {
      const email = uniqueAddress();
      await requestSignInLink(email);

      const [link] = await linksOf(email, 1);
      expect(await openLink(link)).toEqual({ goesTo: "/", signedIn: true });
      expect(await openLink(link)).toEqual({ goesTo: "/login/expired", signedIn: false });
    });
  });

  describe("mail service is down", () => {
    // Nobody listens on port 1: a real refused connection, no mocks
    function breakMail() {
      vi.stubEnv("SMTP_PORT", "1");
    }

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it("says the letter was not sent and does not count the attempt", async () => {
      const email = uniqueAddress();
      breakMail();

      expect(await requestSignInLink(email)).toEqual({
        success: false,
        message: "Не удалось отправить письмо. Попробуйте ещё раз через минуту",
      });

      const [{ total }] = await db.select({ total: count() }).from(signInEmails);
      expect(total).toBe(0);
    });

    it("leaves the old links working", async () => {
      const email = uniqueAddress();
      await requestSignInLink(email);
      const [oldLink] = await linksOf(email, 1);

      breakMail();
      expect(await requestSignInLink(email)).toMatchObject({ success: false });
      vi.unstubAllEnvs();

      expect(await openLink(oldLink)).toEqual({ goesTo: "/", signedIn: true });
    });

    it("lets three letters through after the mail is back", async () => {
      const email = uniqueAddress();
      for (let attempt = 0; attempt < 3; attempt++) {
        breakMail();
        expect(await requestSignInLink(email)).toMatchObject({ success: false });
      }
      vi.unstubAllEnvs();

      for (let sent = 1; sent <= 3; sent++) {
        expect(await requestSignInLink(email)).toEqual({ success: true, email });
      }
      expect(await requestSignInLink(email)).toMatchObject({ success: false });
      expect(await waitForEmails(email, 3)).toHaveLength(3);
    });

    it("keeps the address out of the log", async () => {
      const email = uniqueAddress();
      const logged = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log")];
      for (const spy of logged) spy.mockImplementation(() => {});
      breakMail();

      await requestSignInLink(email);

      const everything = logged.flatMap((spy) => spy.mock.calls).map((args) => args.map(String).join(" "));
      expect(everything.join("\n")).not.toContain(email);
      expect(everything.join("\n")).not.toContain(email.split("@")[0]);
    });
  });
});
