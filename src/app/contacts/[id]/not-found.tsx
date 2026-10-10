import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function ContactNotFound() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-background px-6 py-16 text-center">
      <h1 className="text-xl font-semibold">Контакт не найден</h1>
      <p className="text-muted-foreground">Возможно, ссылка устарела или в ней опечатка.</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Ко всем контактам
      </Link>
    </div>
  );
}
