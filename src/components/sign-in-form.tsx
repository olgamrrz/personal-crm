"use client";

import { useActionState } from "react";

import { requestLink, type SignInFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SignInFormState = {};

export function SignInForm() {
  const [state, formAction, pending] = useActionState(requestLink, initialState);

  return (
    // noValidate: the browser's own message for a wrong address is in English, ours is shown under the field
    <form action={formAction} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Почта</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="anna@example.com"
          // React clears the form after each submit, so the field gets what was typed back
          defaultValue={state.value}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
        />
        <p id="email-error" className="min-h-5 text-sm text-destructive" aria-live="polite">
          {state.error}
        </p>
      </div>
      <Button type="submit" size="lg" disabled={pending} className="h-12 w-full text-base">
        {pending ? "Отправляю…" : "Получить ссылку"}
      </Button>
      {state.sentTo && (
        <p role="status" className="rounded-field bg-mist-100 px-4 py-3 text-sm">
          Ссылка для входа отправлена на {state.sentTo}
        </p>
      )}
    </form>
  );
}
