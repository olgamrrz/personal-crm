import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  addNote,
  deleteContact,
  markContacted,
  setContactBirthday,
  setContactFrequency,
} from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { BirthdayRow } from "@/components/birthday-row";
import { ContactAvatar } from "@/components/contact-avatar";
import { ContactGroupsRow } from "@/components/contact-groups-row";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { DetailRow } from "@/components/detail-row";
import { KeepInTouchRows } from "@/components/keep-in-touch-rows";
import { NoteForm } from "@/components/note-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBirthday } from "@/lib/birthday";
import { getContact, getContactGroupIds, getLastContact, listNotes, parseContactId } from "@/lib/contacts";
import { formatDateTime, formatLastConversation, phoneHref, pluralize } from "@/lib/format";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Карточка контакта",
};

export default function ContactPage({ params }: PageProps<"/contacts/[id]">) {
  return (
    <div className="space-y-5">
      <BackLink />
      <Suspense fallback={<ContactSkeleton />}>
        <ContactDetails params={params} />
      </Suspense>
    </div>
  );
}

async function ContactDetails({ params }: Pick<PageProps<"/contacts/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  const contactId = parseContactId(id);
  if (!contactId) notFound();

  const [contact, notes, lastContact, groups, groupIds] = await Promise.all([
    getContact(user.id, contactId),
    listNotes(user.id, contactId),
    getLastContact(user.id, contactId),
    listGroups(user.id),
    getContactGroupIds(user.id, contactId),
  ]);
  if (!contact) notFound();

  const addNoteToContact = addNote.bind(null, contact.id);
  const deleteThisContact = deleteContact.bind(null, contact.id);
  const setThisContactBirthday = setContactBirthday.bind(null, contact.id);
  const setThisContactFrequency = setContactFrequency.bind(null, contact.id);
  const markThisContacted = markContacted.bind(null, contact.id);

  return (
    <>
      <Card>
        <CardHeader className="flex items-center gap-4">
          <ContactAvatar id={contact.id} name={contact.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <h1 className="font-serif text-title font-medium break-words sm:text-title-lg">{contact.name}</h1>
            {contact.about && <p className="mt-1.5 text-base text-muted-foreground">{contact.about}</p>}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:gap-y-3">
            <DetailRow icon={<MapPin aria-hidden className="size-4" />} label="Откуда знакомы">
              {contact.howWeMet}
            </DetailRow>
            <DetailRow icon={<Phone aria-hidden className="size-4" />} label="Телефон">
              {contact.phone && (
                <a href={phoneHref(contact.phone)} className="underline-offset-4 hover:underline">
                  {contact.phone}
                </a>
              )}
            </DetailRow>
            <DetailRow icon={<Mail aria-hidden className="size-4" />} label="Почта">
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="break-all underline-offset-4 hover:underline">
                  {contact.email}
                </a>
              )}
            </DetailRow>
            <BirthdayRow
              birthday={
                contact.birthdayDay !== null && contact.birthdayMonth !== null
                  ? formatBirthday({
                      day: contact.birthdayDay,
                      month: contact.birthdayMonth,
                      year: contact.birthdayYear,
                    })
                  : ""
              }
              setBirthdayAction={setThisContactBirthday}
            />
            <ContactGroupsRow
              contactId={contact.id}
              groups={groups.map(({ id, name }) => ({ id, name }))}
              selectedIds={groupIds}
            />
            <KeepInTouchRows
              frequency={contact.contactFrequency}
              lastConversation={formatLastConversation(
                lastContact?.day ?? null,
                lastContact?.isToday ?? false,
              )}
              setFrequencyAction={setThisContactFrequency}
              markContactedAction={markThisContacted}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Заметки <span className="font-sans text-base text-muted-foreground">({notes.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <NoteForm action={addNoteToContact} />
          {notes.length > 0 ? (
            <ol className="space-y-3" aria-label={pluralize(notes.length, "заметка", "заметки", "заметок")}>
              {notes.map((note) => (
                <li key={note.id} className="rounded-field bg-background px-4 py-3">
                  <time dateTime={note.createdAt.toISOString()} className="text-xs text-muted-foreground">
                    {formatDateTime(note.createdAt)}
                  </time>
                  <p className="mt-1 whitespace-pre-wrap break-words">{note.body}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Заметок пока нет. Запишите, о чём поговорили и о чём договорились.
            </p>
          )}
        </CardContent>
      </Card>

      <DeleteContactButton contactName={contact.name} noteCount={notes.length} action={deleteThisContact} />
    </>
  );
}

function ContactSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Загружаю карточку">
      <div className="space-y-6 rounded-card bg-card p-5.5 sm:rounded-card-lg sm:p-7">
        <div className="flex items-center gap-4">
          <div className="size-14 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-9 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-48 animate-pulse rounded-card bg-card sm:rounded-card-lg" />
    </div>
  );
}
