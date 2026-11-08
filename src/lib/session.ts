import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";

// The signed-in user of this request, or null. One lookup per request, however many components ask.
// Reads the request headers, so with Cache Components it may only be called inside <Suspense>.
export const getCurrentUser = cache(async () => {
  // Reading never renews the sign-in: a page cannot set the fresh cookie, and a renewal in the database alone
  // would leave the browser with a cookie that dies 30 days after the sign-in. The renewal is made by
  // src/components/session-renewal.tsx through Better Auth's own route, which sets the cookie too.
  const session = await auth.api.getSession({ headers: await headers(), query: { disableRefresh: true } });
  return session?.user ?? null;
});

// The real check of the sign-in, next to the data: every page with data and every Server Action starts with it.
// Without a sign-in the person goes to the sign-in page, and nothing after this line runs.
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
