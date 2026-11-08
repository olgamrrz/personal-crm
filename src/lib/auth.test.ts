import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { parseSignInEmail } from "@/lib/validation";

import { extractSignInLink, waitForEmails } from "../../test/mailpit";

// Every test writes to an address of its own, so letters of other tests do not get mixed in
function uniqueAddress() {
  return `auth-${randomUUID()}@example.com`;
}

// What the server action does after it has checked the address
function requestLink(email: string) {
  return auth.api.signInMagicLink({
    body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
    headers: new Headers(),
  });
}

describe("sign-in link through Better Auth", () => {
  it("sends an email with a link to /api/auth/magic-link/verify", async () => {
    const email = uniqueAddress();
    await requestLink(email);

    const [letter] = await waitForEmails(email);
    const link = new URL(extractSignInLink(letter));
    expect(link.origin).toBe(process.env.BETTER_AUTH_URL);
    expect(link.pathname).toBe("/api/auth/magic-link/verify");
    expect(link.searchParams.get("token")).toBeTruthy();
    expect(link.searchParams.get("errorCallbackURL")).toBe("/login/expired");
  });

  it("keeps the link for 15 minutes", async () => {
    const email = uniqueAddress();
    const before = Date.now();
    await requestLink(email);

    const [record] = await db
      .select()
      .from(verifications)
      .where(like(verifications.value, `%${email}%`));
    const minutes = (record.expiresAt.getTime() - before) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15.1);
  });

  it("keeps only a hash of the link in the database", async () => {
    const email = uniqueAddress();
    await requestLink(email);

    const [letter] = await waitForEmails(email);
    const token = new URL(extractSignInLink(letter)).searchParams.get("token")!;
    const [record] = await db
      .select()
      .from(verifications)
      .where(like(verifications.value, `%${email}%`));
    expect(record.identifier).toMatch(/^magic-link:/);
    expect(record.identifier).not.toContain(token);
    expect(record.value).not.toContain(token);
    expect(
      await db
        .select()
        .from(verifications)
        .where(eq(verifications.identifier, `magic-link:${token}`)),
    ).toEqual([]);
  });

  it("accepts every address that parseSignInEmail accepts", async () => {
    const samples = [
      "anna@example.com",
      "a.b+tag@sub.example.co.uk",
      "o'neil@example.com",
      "anna_1@example-site.com",
      "AN@EXAMPLE.COM",
      "a@b.io",
      "анна@example.com",
      `${"a".repeat(64)}@example.com`,
    ];
    for (const sample of samples) {
      const parsed = parseSignInEmail(sample);
      if (!parsed.success) continue;
      await expect(requestLink(parsed.data), sample).resolves.toBeDefined();
    }
  });
});
