import { Plus, SearchX, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ContactRows } from "@/components/contact-rows";
import { SearchBox } from "@/components/search-box";
import { buttonVariants } from "@/components/ui/button";
import { listContacts, parseContactId } from "@/lib/contacts";
import { pluralize } from "@/lib/format";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Контакты</h1>
        <Link href="/contacts/new" className={buttonVariants({ size: "lg", className: "h-10 px-4" })}>
          <Plus aria-hidden />
          Добавить контакт
        </Link>
      </div>
      <Suspense fallback={<ContactsSkeleton />}>
        <Contacts searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function firstValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

async function Contacts({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const params = await searchParams;
  const query = firstValue(params.q).trim();
  const addedId = parseContactId(firstValue(params.added));

  const contacts = await listContacts(query);
  const added = addedId ? contacts.find((contact) => contact.id === addedId) : undefined;

  return (
    <div className="space-y-4">
      <SearchBox defaultValue={query} />

      {added && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          Контакт «{added.name}» добавлен.{" "}
          <Link href={`/contacts/${added.id}`} className="font-medium underline underline-offset-4">
            Открыть карточку
          </Link>
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {query
          ? `Найдено: ${contacts.length}`
          : pluralize(contacts.length, "контакт", "контакта", "контактов")}
      </p>

      {contacts.length > 0 ? (
        <ContactRows contacts={contacts} highlightId={added?.id} />
      ) : query ? (
        <EmptyState icon={<SearchX aria-hidden className="size-6" />}>
          Никого не нашли по запросу «{query}»
        </EmptyState>
      ) : (
        <EmptyState icon={<UserRound aria-hidden className="size-6" />}>
          Пока нет ни одного контакта.{" "}
          <Link href="/contacts/new" className="font-medium text-foreground underline underline-offset-4">
            Добавить первый
          </Link>
        </EmptyState>
      )}
    </div>
  );
}

function EmptyState({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-background px-6 py-12 text-center text-muted-foreground">
      {icon}
      <p>{children}</p>
    </div>
  );
}

function ContactsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загружаю контакты">
      <div className="h-10 rounded-lg border bg-background" />
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="divide-y rounded-xl border bg-background">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-3">
            <div className="size-10 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
