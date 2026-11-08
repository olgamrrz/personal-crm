"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { requestSignInLink } from "@/lib/sign-in";

export type SignInFormState = {
  // The address the link was sent to, as saved (no spaces, lower case)
  sentTo?: string;
  error?: string;
  // What was typed, so the field keeps it after the form is reset
  value?: string;
};

export async function requestLink(_prevState: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const typed = formData.get("email");
  const value = typeof typed === "string" ? typed : "";

  const result = await requestSignInLink(typed);
  if (!result.success) {
    return { error: result.message, value };
  }
  return { sentTo: result.email, value };
}

// «Выйти»: ends the sign-in on this device only; the other devices stay signed in
export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
