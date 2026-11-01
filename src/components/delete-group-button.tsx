"use client";

import { useState, useTransition } from "react";

import { deleteGroup } from "@/app/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pluralize } from "@/lib/format";
import { DELETE_FAILED } from "@/lib/messages";

export function DeleteGroupButton({
  groupId,
  groupName,
  contactCount,
}: {
  groupId: number;
  groupName: string;
  contactCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setError(undefined);
  }

  // The window closes when the group is deleted; on an error it stays open with the message
  function handleDelete() {
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await deleteGroup(groupId);
        if (result.error) {
          setError(result.error);
        } else {
          setOpen(false);
        }
      } catch {
        setError(DELETE_FAILED);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button
            variant="destructive"
            size="lg"
            aria-label={`Удалить группу «${groupName}»`}
            className="h-11 px-4 sm:h-9"
          />
        }
      >
        Удалить
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">Удалить группу «{groupName}»?</AlertDialogTitle>
          <AlertDialogDescription>
            В ней {pluralize(contactCount, "контакт", "контакта", "контактов")}. Контакты останутся, только
            выйдут из группы. Вернуть группу будет нельзя.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">Отмена</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            size="lg"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? "Удаляю…" : "Удалить"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
