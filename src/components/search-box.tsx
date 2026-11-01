"use client";

import { LoaderCircle, Search } from "lucide-react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { homeUrl } from "@/lib/home-url";

const SEARCH_DELAY_MS = 250;

// `group` is the chosen group of the filter: searching must not drop it
export function SearchBox({ defaultValue, group }: { defaultValue: string; group?: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Search as the user types; the form submit (Enter) still works on its own
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const query = event.target.value.trim();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const url = homeUrl({ query, group });
      startTransition(() => router.replace(url, { scroll: false }));
    }, SEARCH_DELAY_MS);
  }

  return (
    <Form action="/" role="search" className="relative">
      {/* Enter submits the form as an address: the group goes along with the text */}
      {group !== undefined && <input type="hidden" name="group" value={group} />}
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        name="q"
        defaultValue={defaultValue}
        onChange={handleChange}
        placeholder="Поиск по имени"
        aria-label="Поиск по имени"
        autoComplete="off"
        className="rounded-full pr-11 pl-11"
      />
      {isPending && (
        <LoaderCircle
          aria-label="Ищу…"
          className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      )}
    </Form>
  );
}
