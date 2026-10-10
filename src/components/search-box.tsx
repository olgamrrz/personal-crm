"use client";

import { LoaderCircle, Search } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Input } from "@/components/ui/input";

const SEARCH_DELAY_MS = 250;

export function SearchBox({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Search as the user types; the form submit (Enter) still works on its own
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const query = event.target.value.trim();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const url = query ? `/?q=${encodeURIComponent(query)}` : "/";
      startTransition(() => router.replace(url, { scroll: false }));
    }, SEARCH_DELAY_MS);
  }

  return (
    <Form action="/" role="search" className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder="Поиск по имени"
        aria-label="Поиск по имени"
        autoComplete="off"
        className="h-10 bg-background pr-9 pl-9"
      />
      {isPending && (
        <LoaderCircle
          aria-label="Ищу…"
          className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      )}
    </Form>
  );
}
