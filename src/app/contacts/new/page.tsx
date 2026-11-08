import type { Metadata } from "next";
import { Suspense } from "react";

import { BackLink } from "@/components/back-link";
import { NewContactForm } from "@/components/contact-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listGroups } from "@/lib/groups";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Новый контакт",
};

export default function NewContactPage() {
  return (
    <div className="space-y-5">
      <BackLink />
      <Card>
        <CardHeader>
          <CardTitle className="text-title sm:text-title-lg">Новый контакт</CardTitle>
          <CardDescription className="mt-1.5 text-base">
            Обязательно только имя, остальное — по желанию.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<FormSkeleton />}>
            <FormWithGroups />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

// The form needs the list of groups for its "Группы" field
async function FormWithGroups() {
  const user = await requireUser();
  const groups = await listGroups(user.id);
  return <NewContactForm groups={groups.map(({ id, name }) => ({ id, name }))} />;
}

function FormSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Загружаю форму">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-11 animate-pulse rounded-field bg-muted" />
        </div>
      ))}
    </div>
  );
}
