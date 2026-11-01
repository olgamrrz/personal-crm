"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { renameGroup } from "@/app/actions";
import { DeleteGroupButton } from "@/components/delete-group-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pluralize } from "@/lib/format";
import type { GroupListItem } from "@/lib/groups";
import { SAVE_FAILED } from "@/lib/messages";
import { GROUP_NAME_MAX_LENGTH } from "@/lib/validation";

// One row of the groups page: the name (a link to the filtered list), the number of contacts,
// and the buttons to rename and delete. "Переименовать" turns the row into a field.
export function GroupRow({ group }: { group: GroupListItem }) {
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <li className="px-5 py-3">
        <RenameForm group={group} onDone={() => setRenaming(false)} />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-3">
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={`/?group=${group.id}`}
          className="block font-bold break-words underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
        >
          {group.name}
        </Link>
        <p className="text-sm text-muted-foreground">
          {pluralize(group.contactCount, "контакт", "контакта", "контактов")}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => setRenaming(true)}
          aria-label={`Переименовать группу «${group.name}»`}
          className="h-11 px-4 sm:h-9"
        >
          Переименовать
        </Button>
        <DeleteGroupButton groupId={group.id} groupName={group.name} contactCount={group.contactCount} />
      </div>
    </li>
  );
}

function RenameForm({ group, onDone }: { group: GroupListItem; onDone: () => void }) {
  const [name, setName] = useState(group.name);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const inputId = `rename-group-${group.id}`;
  const errorId = `${inputId}-error`;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await renameGroup(group.id, name);
        if (result.error) {
          setError(result.error);
        } else {
          onDone();
        }
      } catch {
        setError(SAVE_FAILED);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
      noValidate
      className="space-y-2"
    >
      <Label htmlFor={inputId} className="sr-only">
        Новое название группы «{group.name}»
      </Label>
      <div className="flex flex-wrap gap-3 sm:flex-nowrap">
        <Input
          id={inputId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          autoFocus
          maxLength={GROUP_NAME_MAX_LENGTH}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="basis-full sm:basis-auto"
        />
        <Button type="submit" size="lg" disabled={pending} className="h-11 px-5 sm:h-9">
          {pending ? "Сохраняю…" : "Сохранить"}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onDone} className="h-11 px-5 sm:h-9">
          Отмена
        </Button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
