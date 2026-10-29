"use client";

import { useActionState } from "react";

import type { NoteFormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_MAX_LENGTH } from "@/lib/validation";

const initialState: NoteFormState = {};

export function NoteForm({
  action,
}: {
  action: (prevState: NoteFormState, formData: FormData) => Promise<NoteFormState>;
}) {
  // React clears the form after each submit; on error the text comes back via state.value
  const [state, formAction, pending] = useActionState(action, initialState);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form action={formAction} noValidate className="space-y-3">
      <Label htmlFor="note-body" className="sr-only">
        Новая заметка
      </Label>
      <Textarea
        id="note-body"
        name="body"
        rows={3}
        defaultValue={state.value}
        onKeyDown={handleKeyDown}
        placeholder="О чём поговорили, о чём договорились"
        maxLength={NOTE_MAX_LENGTH}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "note-error" : undefined}
        className="min-h-24"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id="note-error" className="text-sm text-destructive" aria-live="polite">
          {state.error}
        </p>
        <Button type="submit" size="lg" disabled={pending} className="ml-auto">
          {pending ? "Сохраняю…" : "Добавить заметку"}
        </Button>
      </div>
    </form>
  );
}
