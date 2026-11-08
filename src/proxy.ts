import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// A quick check, not the protection: no sign-in cookie means the sign-in page, without a trip to the database.
// The protection itself is requireUser() (src/lib/session.ts) next to the data, which also catches
// a cookie that the server no longer knows.
export function proxy(request: NextRequest) {
  // A Server Action is a POST to the page the person is on. Redirecting it would make the browser read a page
  // instead of the answer of the action, and the form would just hang. The action starts with requireUser(),
  // which sends the person to the sign-in page the way Next.js expects.
  if (getSessionCookie(request) || request.headers.has("next-action")) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the sign-in pages, Better Auth (the link from the email), /health for deploys and static files
  matcher: ["/((?!(?:login|api/auth|health)(?:/|$)|_next/|icon\\.svg$).*)"],
};
