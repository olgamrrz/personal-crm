import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { addNote, deleteContact } from "@/app/actions";
import { BackLink } from "@/components/back-link";
import { ContactAvatar } from "@/components/contact-avatar";
import { DeleteContactButton } from "@/components/delete-contact-button";
import { NoteForm } from "@/components/note-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContact, listNotes, parseContactId } from "@/lib/contacts";
import { formatDateTime, phoneHref, pluralize } from "@/lib/format";

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
  const { id } = await params;
  const contactId = parseContactId(id);
  if (!contactId) notFound();

  const [contact, notes] = await Promise.all([getContact(contactId), listNotes(contactId)]);
  if (!contact) notFound();

  const addNoteToContact = addNote.bind(null, contact.id);
  const deleteThisContact = deleteContact.bind(null, contact.id);

  return (
    <>
      <Card>
        <CardHeader className="flex items-center gap-4">
          <ContactAvatar id={contact.id} name={contact.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight break-words">{contact.name}</h1>
            {contact.about && <p className="text-muted-foreground">{contact.about}</p>}
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
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Заметки{" "}
            <span className="font-normal text-muted-foreground">({notes.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <NoteForm action={addNoteToContact} />
          {notes.length > 0 ? (
            <ol className="space-y-3" aria-label={pluralize(notes.length, "заметка", "заметки", "заметок")}>
              {notes.map((note) => (
                <li key={note.id} className="rounded-lg border bg-muted/30 px-4 py-3">
                  <time
                    dateTime={note.createdAt.toISOString()}
                    className="text-xs text-muted-foreground"
                  >
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

      <DeleteContactButton
        contactName={contact.name}
        noteCount={notes.length}
        action={deleteThisContact}
      />
    </>
  );
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="-mt-3 pl-6 sm:mt-0 sm:pl-0">
        {children || <span className="text-muted-foreground">не указано</span>}
      </dd>
    </>
  );
}

function ContactSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Загружаю карточку">
      <div className="space-y-6 rounded-xl bg-background p-4 ring-1 ring-foreground/10">
        <div className="flex items-center gap-4">
          <div className="size-14 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-background ring-1 ring-foreground/10" />
    </div>
  );
}
