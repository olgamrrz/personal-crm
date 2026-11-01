"use client";

import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import type { ContactListItem } from "@/lib/contacts";
import { cn } from "@/lib/utils";

// A Client Component on purpose: the server sends one compact array of contacts
// instead of a thousand separately serialized <Link> elements, which keeps the list fast.
export function ContactRows({
  contacts,
  groups,
  highlightId,
}: {
  contacts: ContactListItem[];
  // All groups, by name, sent once; a contact brings only the ids of its groups
  groups: { id: number; name: string }[];
  highlightId?: number;
}) {
  const nameById = new Map(groups.map((group) => [group.id, group.name]));
  // Position of a group in the alphabetical list: labels follow it
  const positionById = new Map(groups.map((group, index) => [group.id, index]));

  function labelsOf(groupIds: number[]) {
    return groupIds
      .filter((id) => nameById.has(id))
      .sort((a, b) => positionById.get(a)! - positionById.get(b)!)
      .map((id) => ({ id, name: nameById.get(id)! }));
  }

  return (
    <ul className="divide-y overflow-hidden rounded-card bg-card sm:rounded-card-lg">
      {contacts.map((contact) => (
        <li key={contact.id}>
          <Link
            href={`/contacts/${contact.id}`}
            className={cn(
              "flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
              contact.id === highlightId && "bg-muted hover:bg-muted",
            )}
          >
            <ContactAvatar id={contact.id} name={contact.name} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{contact.name}</div>
              {contact.about && <div className="truncate text-sm text-muted-foreground">{contact.about}</div>}
              {contact.groupIds.length > 0 && (
                // Labels are not links of their own: a tap anywhere in the row opens the card
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {labelsOf(contact.groupIds).map((group) => (
                    <span
                      key={group.id}
                      className="max-w-full truncate rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground"
                    >
                      {group.name}
                    </span>
                  ))}
                </div>
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
