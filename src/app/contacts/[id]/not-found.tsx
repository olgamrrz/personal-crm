import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-16 text-center sm:rounded-card-lg">
      <h1 className="font-serif text-heading font-medium sm:text-heading-lg">Контакт не найден</h1>
      <p className="text-muted-foreground">Возможно, ссылка устарела или в ней опечатка.</p>
      <Link href="/" className={buttonVariants({ variant: "outline", size: "lg" })}>
        Ко всем контактам
      </Link>
    </div>
  );
}
