import { SearchX, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ContactRows } from "@/components/contact-rows";
import { EmptyState } from "@/components/empty-state";
import { GroupFilter } from "@/components/group-filter";
import { OverdueContacts } from "@/components/overdue-contacts";
import { SearchBox } from "@/components/search-box";
import { buttonVariants } from "@/components/ui/button";
import { listContacts, listOverdueContacts, parseContactId } from "@/lib/contacts";
import { pluralize } from "@/lib/format";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { parseId } from "@/lib/validation";

export default function ContactsPage({ searchParams }: PageProps<"/">) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-serif text-title font-medium sm:text-title-lg">Контакты</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Like the landing's main button: text plus an arrow in a circle; full width on phones */}
          <Link
            href="/contacts/new"
            className={cn(buttonVariants({ size: "lg" }), "h-13 justify-between gap-6 pr-2 pl-6 text-base")}
          >
            Добавить контакт
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-full bg-cream text-lg text-cobalt"
            >
              →
            </span>
          </Link>
          {/* The second action: under the main button on phones, next to it on wide screens */}
          <Link
            href="/groups"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-13 px-6 text-base")}
          >
            Группы
          </Link>
        </div>
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
  const user = await requireUser();
  const params = await searchParams;
  const query = firstValue(params.q).trim();
  const addedId = parseContactId(firstValue(params.added));
  const deleted = firstValue(params.deleted) !== "";

  const groupId = parseId(firstValue(params.group));

  // Loaded together, so the block and the list appear at once and the search box does not jump.
  // Neither the search nor the group filters the block.
  const [contacts, overdueContacts, allGroups] = await Promise.all([
    listContacts(user.id, query, groupId ?? undefined),
    listOverdueContacts(user.id),
    listGroups(user.id),
  ]);
  const groups = allGroups.map(({ id, name }) => ({ id, name }));
  // A link to a group that has been deleted since shows everybody, and "Все" is chosen
  const selectedGroup = groups.find((group) => group.id === groupId);
  const added = addedId ? contacts.find((contact) => contact.id === addedId) : undefined;

  return (
    <div className="space-y-4">
      <OverdueContacts contacts={overdueContacts} />

      <SearchBox defaultValue={query} group={selectedGroup?.id} />

      <GroupFilter groups={groups} selectedId={selectedGroup?.id} query={query} />

      {added && (
        <div role="status" className="rounded-field bg-mist-100 px-4 py-3 text-sm">
          Контакт «{added.name}» добавлен.{" "}
          <Link href={`/contacts/${added.id}`} className="font-medium underline underline-offset-4">
            Открыть карточку
          </Link>
        </div>
      )}

      {deleted && (
        <div role="status" className="rounded-field bg-card px-4 py-3 text-sm">
          Контакт удалён.
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {query
          ? `Найдено: ${contacts.length}`
          : pluralize(contacts.length, "контакт", "контакта", "контактов")}
      </p>

      {contacts.length > 0 ? (
        <ContactRows contacts={contacts} groups={groups} highlightId={added?.id} />
      ) : selectedGroup && query ? (
        <EmptyState icon={<SearchX aria-hidden className="size-6" />}>
          В группе «{selectedGroup.name}» никого не нашли по запросу «{query}»
        </EmptyState>
      ) : selectedGroup ? (
        <EmptyState icon={<UsersRound aria-hidden className="size-6" />}>
          В группе «{selectedGroup.name}» пока никого. Добавить контакт в группу можно в его карточке
        </EmptyState>
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

function ContactsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загружаю контакты">
      <div className="h-11 rounded-full border bg-card" />
      <div className="h-5 w-32 animate-pulse rounded bg-muted" />
      <div className="divide-y overflow-hidden rounded-card bg-card sm:rounded-card-lg">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-5 py-3">
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
