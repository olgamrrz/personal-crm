"use client";

import { useState, useTransition } from "react";

import { createGroup } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SAVE_FAILED } from "@/lib/messages";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/validation";

// The field and the "Создать" button on the groups page. On success the page refreshes and the group
// appears in the list; on an error the text stays, so it can be fixed.
export function CreateGroupForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await createGroup(name);
        if (result.error) {
          setError(result.error);
        } else {
          setName("");
        }
      } catch {
        setError(SAVE_FAILED);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-2">
      <Label htmlFor="new-group-name" className="sr-only">
        Название новой группы
      </Label>
      <div className="flex gap-3">
        <Input
          id="new-group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Название новой группы, например «Теннис»"
          autoComplete="off"
          maxLength={GROUP_NAME_MAX_LENGTH}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-group-error" : undefined}
        />
        <Button type="submit" size="lg" disabled={pending} className="h-11 px-6">
          {pending ? "Создаю…" : "Создать"}
        </Button>
      </div>
      {error && (
        <p id="new-group-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
