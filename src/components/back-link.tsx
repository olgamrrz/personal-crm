import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="size-4" />
      Все контакты
    </Link>
  );
}
