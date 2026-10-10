"use client";

import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import type { ContactListItem } from "@/lib/contacts";
import { cn } from "@/lib/utils";

// A Client Component on purpose: the server sends one compact array of contacts
// instead of a thousand separately serialized <Link> elements, which keeps the list fast.
export function ContactRows({
  contacts,
  highlightId,
}: {
  contacts: ContactListItem[];
  highlightId?: number;
}) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-background">
      {contacts.map((contact) => (
        <li key={contact.id}>
          <Link
            href={`/contacts/${contact.id}`}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
              contact.id === highlightId && "bg-emerald-50 hover:bg-emerald-100/70",
            )}
          >
            <ContactAvatar id={contact.id} name={contact.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{contact.name}</div>
              {contact.about && (
                <div className="truncate text-sm text-muted-foreground">{contact.about}</div>
              )}
            </div>
            <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
              {contact.phone && <div>{contact.phone}</div>}
              {contact.email && <div>{contact.email}</div>}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
