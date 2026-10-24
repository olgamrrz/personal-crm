"use client";

import { Check, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";

import { markContacted } from "@/app/actions";
import { ContactAvatar } from "@/components/contact-avatar";
import { Button } from "@/components/ui/button";
import { CONTACT_FREQUENCY_LABELS } from "@/lib/contact-frequency";
import type { OverdueContact } from "@/lib/contacts";
import { pluralize } from "@/lib/format";

const MARK_FAILED = "Не удалось отметить. Проверьте интернет и попробуйте ещё раз.";

// The "Пора связаться" block on the home page. A row is a link to the card plus a separate
// "Пообщались" button next to it: a button inside a link is invalid and would open the card.
export function OverdueContacts({ contacts }: { contacts: OverdueContact[] }) {
  // A marked row disappears at once; if marking fails, it comes back with a message
  const [hiddenIds, hide] = useOptimistic<number[], number>([], (ids, id) => [...ids, id]);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [, startTransition] = useTransition();

  function setError(id: number, error?: string) {
    setErrors((current) => {
      const next = { ...current };
      if (error) next[id] = error;
      else delete next[id];
      return next;
    });
  }

  function handleMark(id: number) {
    setError(id, undefined);
    startTransition(async () => {
      hide(id);
      try {
        const result = await markContacted(id);
        if (result.error) setError(id, result.error);
      } catch {
        setError(id, MARK_FAILED);
      }
    });
  }

  const visible = contacts.filter((contact) => !hiddenIds.includes(contact.id));
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="overdue-title" className="overflow-hidden rounded-xl border bg-background">
      <div className="flex items-baseline gap-1.5 px-4 pt-3.5 pb-3">
        <h2 id="overdue-title" className="font-semibold">
          Пора связаться
        </h2>
        <span className="text-sm text-muted-foreground">({visible.length})</span>
      </div>
      <ul>
        {visible.map((contact) => {
          const overdue = `просрочено на ${pluralize(contact.overdueDays, "день", "дня", "дней")}`;
          const error = errors[contact.id];
          return (
            <li
              key={contact.id}
              className="border-t transition-colors has-[a:hover]:bg-muted/60 has-[a:focus-visible]:bg-muted/60"
            >
              <div className="flex items-center gap-2 pr-4 sm:gap-4">
                <Link
                  href={`/contacts/${contact.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 focus-visible:outline-none"
                >
                  <ContactAvatar id={contact.id} name={contact.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{contact.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {CONTACT_FREQUENCY_LABELS[contact.frequency]}
                    </div>
                    <div className="text-sm font-medium sm:hidden">{overdue}</div>
                  </div>
                  <div className="hidden shrink-0 text-sm font-medium whitespace-nowrap sm:block">
                    {overdue}
                  </div>
                </Link>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => handleMark(contact.id)}
                  aria-label={`Пообщались: ${contact.name}`}
                  aria-describedby={error ? `overdue-error-${contact.id}` : undefined}
                  className="h-11 px-3 sm:h-9"
                >
                  <Check aria-hidden className="hidden sm:block" />
                  Пообщались
                </Button>
              </div>
              {error && (
                <p
                  id={`overdue-error-${contact.id}`}
                  role="alert"
                  className="flex items-start gap-1.5 px-4 pb-3 text-sm text-destructive"
                >
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
