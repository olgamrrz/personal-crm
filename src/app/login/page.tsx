import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { SignInForm } from "@/components/sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Вход",
};

// A person who is already signed in has nothing to do here: the home page opens instead
async function GoHomeIfSignedIn() {
  if (await getCurrentUser()) {
    redirect("/");
  }
  return null;
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md">
      <Suspense>
        <GoHomeIfSignedIn />
      </Suspense>
      <Card>
        <CardHeader>
          <CardTitle className="text-title sm:text-title-lg">Вход</CardTitle>
          <CardDescription className="mt-1.5 text-base">
            Введите почту, и мы пришлём ссылку для входа. Пароль не нужен.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInForm />
        </CardContent>
      </Card>
    </div>
  );
}
