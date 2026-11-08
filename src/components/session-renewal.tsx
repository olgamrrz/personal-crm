"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Keeps the sign-in for 30 days since the last visit. A page cannot set cookies while it is drawn, so the
// renewal is a request to Better Auth when a page opens: if more than an hour has passed since the last
// renewal, the term becomes «30 days from now» and the browser gets a fresh cookie.
// It runs again on every move to another page, so a tab that stays open for weeks keeps the sign-in too.
export function SessionRenewal() {
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/get-session", { cache: "no-store" }).catch(() => {
      // No connection: the next page tries again
    });
  }, [pathname]);

  return null;
}
