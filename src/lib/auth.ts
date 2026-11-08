import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";

import { db } from "@/db";
import { sendMail } from "@/lib/mailer";
import { buildSignInEmail, SIGN_IN_LINK_MINUTES } from "@/lib/sign-in-email";

const DAY_SECONDS = 24 * 60 * 60;

// Sign-in by a link from an email. Pages and Server Actions get the user through src/lib/session.ts;
// links are requested only through requestSignInLink (src/lib/sign-in.ts), which checks the address and the limit.
export const auth = betterAuth({
  // The tables are users, sessions, accounts, verifications (src/db/schema.ts)
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // Nothing about this app is sent anywhere
  telemetry: { enabled: false },
  session: {
    // The sign-in lasts 30 days since the last visit. The term moves at most once an hour,
    // so "30 days since the last visit" is exact to the hour.
    expiresIn: 30 * DAY_SECONDS,
    updateAge: 60 * 60,
  },
  // A link cannot be requested by an HTTP call straight to Better Auth (404): that would skip the address
  // check and the limit of letters. The server calls auth.api.signInMagicLink itself, which this does not touch.
  disabledPaths: ["/sign-in/magic-link"],
  rateLimit: {
    // The built-in limit counts by IP, and behind nginx every visitor has the same one. Guessing a link is
    // pointless anyway: the token is 32 random letters. The limit of letters is ours, by email.
    customRules: { "/magic-link/verify": false },
  },
  plugins: [
    magicLink({
      expiresIn: SIGN_IN_LINK_MINUTES * 60,
      // Only a hash of the link is kept, so a leaked database gives no working links
      storeToken: "hashed",
      sendMagicLink: async ({ email, url }) => {
        await sendMail({ to: email, ...buildSignInEmail(url) });
      },
    }),
    // Must be the last plugin: it lets Server Actions set cookies
    nextCookies(),
  ],
});
