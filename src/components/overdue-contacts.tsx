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
    // A dark blue panel, like the one in the landing's "Solution" section
    <section
      aria-labelledby="overdue-title"
      className="overflow-hidden rounded-panel bg-cobalt-700 pb-2 text-cream sm:rounded-panel-lg"
    >
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3 sm:px-7 sm:pt-6">
        <h2 id="overdue-title" className="font-serif text-heading font-medium sm:text-heading-lg">
          Пора связаться
        </h2>
        <span className="text-sm text-mist">({visible.length})</span>
      </div>
      <ul>
        {visible.map((contact) => {
          const overdue = `просрочено на ${pluralize(contact.overdueDays, "день", "дня", "дней")}`;
          const error = errors[contact.id];
          return (
            <li
              key={contact.id}
              className="border-t border-cobalt-line/50 transition-colors has-[a:hover]:bg-cobalt-900/40 has-[a:focus-visible]:bg-cobalt-900/40"
            >
              <div className="flex items-center gap-2 pr-5 sm:gap-4 sm:pr-7">
                <Link
                  href={`/contacts/${contact.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-5 focus-visible:outline-none sm:pl-7"
                >
                  <ContactAvatar id={contact.id} name={contact.name} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold">{contact.name}</div>
                    <div className="text-sm text-mist">
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
                  className="h-11 border-cream px-4 text-cream hover:bg-cream/10 hover:text-cream focus-visible:border-cream focus-visible:ring-cream/50 sm:h-9"
                >
                  <Check aria-hidden className="hidden sm:block" />
                  Пообщались
                </Button>
              </div>
              {error && (
                <p
                  id={`overdue-error-${contact.id}`}
                  role="alert"
                  className="flex items-start gap-1.5 px-5 pb-3 text-sm text-danger-soft sm:px-7"
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
