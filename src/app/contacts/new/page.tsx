import type { Metadata } from "next";

import { BackLink } from "@/components/back-link";
import { NewContactForm } from "@/components/contact-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
          <CardDescription className="mt-1.5 text-base">Обязательно только имя, остальное — по желанию.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewContactForm />
        </CardContent>
      </Card>
    </div>
  );
}
