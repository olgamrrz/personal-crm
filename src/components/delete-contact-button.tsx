"use client";

import { Trash2 } from "lucide-react";
import { useActionState } from "react";

import type { DeleteContactState } from "@/app/actions";
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

const initialState: DeleteContactState = {};

export function DeleteContactButton({
  contactName,
  noteCount,
  action,
}: {
  contactName: string;
  noteCount: number;
  action: (prevState: DeleteContactState, formData: FormData) => Promise<DeleteContactState>;
}) {
  // On success the action redirects to the list, so only an error comes back here
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" size="lg" className="h-10 px-4" />}>
        <Trash2 aria-hidden />
        Удалить контакт
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить контакт?</AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {noteCount > 0
              ? `«${contactName}» и ${pluralize(noteCount, "заметка", "заметки", "заметок")} удалятся навсегда, вернуть их будет нельзя.`
              : `Контакт «${contactName}» удалится навсегда, вернуть его будет нельзя.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.error && (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        )}
        <form action={formAction}>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
              {pending ? "Удаляю…" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
