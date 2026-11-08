import "server-only";

import { and, count, eq, gt, like, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { signInEmails, verifications } from "@/db/schema";
import { auth } from "@/lib/auth";
import { parseSignInEmail } from "@/lib/validation";

// At most this many letters per email within the window
export const SIGN_IN_EMAIL_LIMIT = 3;
export const SIGN_IN_EMAIL_WINDOW_MINUTES = 10;

export const SIGN_IN_TOO_MANY = "Слишком часто, попробуйте через несколько минут";
export const SIGN_IN_SEND_FAILED = "Не удалось отправить письмо. Попробуйте ещё раз через минуту";

export type RequestSignInLinkResult = { success: true; email: string } | { success: false; message: string };

// Thrown inside the transaction to undo it when the letter did not go out
class SendFailed extends Error {}

// Why a letter was not sent, for the log. Not the error text: the errors of the mail server often quote the recipient.
function errorCode(error: unknown) {
  if (error instanceof Error) {
    const code = Reflect.get(error, "code");
    return typeof code === "string" ? code : error.name;
  }
  return "unknown";
}

// The one way to ask for a sign-in link. It checks the address, the limit of letters per email, and sends the letter.
// Arguments of Server Actions come from the client, so `input` can be anything.
export async function requestSignInLink(input: unknown): Promise<RequestSignInLinkResult> {
  const parsed = parseSignInEmail(input);
  if (!parsed.success) {
    return { success: false, message: parsed.errors };
  }
  const email = parsed.data;

  try {
    return await db.transaction(async (tx) => {
      // Two requests for one email go one after another, so they cannot both pass the limit
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${email}, 0))`);

      const windowStart = sql`now() - make_interval(mins => ${SIGN_IN_EMAIL_WINDOW_MINUTES})`;
      // Emails are not kept longer than the window
      await tx.delete(signInEmails).where(lt(signInEmails.sentAt, windowStart));
      const [{ sent }] = await tx
        .select({ sent: count() })
        .from(signInEmails)
        .where(and(eq(signInEmails.email, email), gt(signInEmails.sentAt, windowStart)));
      if (sent >= SIGN_IN_EMAIL_LIMIT) {
        return { success: false, message: SIGN_IN_TOO_MANY };
      }

      // A new link switches off the old ones of this email. Better Auth keeps a link as a row with the email
      // inside its JSON (checked by the test «a new link switches off the old ones»). This goes before the new
      // link is made, and it is undone together with everything else if the letter does not go out.
      await tx
        .delete(verifications)
        .where(
          and(
            like(verifications.identifier, "magic-link:%"),
            sql`strpos(${verifications.value}, ${`"email":${JSON.stringify(email)}`}) > 0`,
          ),
        );

      try {
        await auth.api.signInMagicLink({
          body: { email, callbackURL: "/", errorCallbackURL: "/login/expired" },
          headers: new Headers(),
        });
      } catch (error) {
        console.error("Sign-in email was not sent", { code: errorCode(error) });
        throw new SendFailed();
      }
      await tx.insert(signInEmails).values({ email });

      return { success: true, email };
    });
  } catch (error) {
    if (error instanceof SendFailed) {
      return { success: false, message: SIGN_IN_SEND_FAILED };
    }
    throw error;
  }
}
