import { UsersRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { CreateGroupForm } from "@/components/create-group-form";
import { EmptyState } from "@/components/empty-state";
import { GroupRow } from "@/components/group-row";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Группы",
};

export default function GroupsPage() {
  return (
    <div className="space-y-6">
      <BackLink />
      <h1 className="font-serif text-title font-medium sm:text-title-lg">Группы</h1>
      <CreateGroupForm />
      <Suspense fallback={<GroupsSkeleton />}>
        <GroupList />
      </Suspense>
    </div>
  );
}

async function GroupList() {
  const user = await requireUser();
  const groups = await listGroups(user.id);

  if (groups.length === 0) {
    return (
      <EmptyState icon={<UsersRound aria-hidden className="size-6" />}>
        Групп пока нет. Создайте первую, например «Семья» или «Теннис»
      </EmptyState>
    );
  }

  return (
    <ul className="divide-y overflow-hidden rounded-card bg-card sm:rounded-card-lg">
      {groups.map((group) => (
        <GroupRow key={group.id} group={group} />
      ))}
    </ul>
  );
}

function GroupsSkeleton() {
  return (
    <div
      className="divide-y overflow-hidden rounded-card bg-card sm:rounded-card-lg"
      aria-busy="true"
      aria-label="Загружаю группы"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="space-y-2 px-5 py-3">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
