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
          <CardTitle className="text-xl">Новый контакт</CardTitle>
          <CardDescription>Обязательно только имя, остальное — по желанию.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewContactForm />
        </CardContent>
      </Card>
    </div>
  );
}
