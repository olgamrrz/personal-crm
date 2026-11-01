import Link from "next/link";

import { homeUrl } from "@/lib/home-url";
import { cn } from "@/lib/utils";

// The row under the search: "Все" and every group. One is chosen at a time. Each is a plain link to the home
// page with the group in the address, so the choice survives a reload and can be sent as a link.
// The search text stays in the address. With no groups there is nothing to choose, and no row.
export function GroupFilter({
  groups,
  selectedId,
  query,
}: {
  groups: { id: number; name: string }[];
  selectedId?: number;
  query: string;
}) {
  if (groups.length === 0) return null;

  const items = [
    { key: "all", label: "Все", href: homeUrl({ query }), selected: selectedId === undefined },
    ...groups.map((group) => ({
      key: String(group.id),
      label: group.name,
      href: homeUrl({ query, group: group.id }),
      selected: group.id === selectedId,
    })),
  ];

  return (
    <nav aria-label="Фильтр по группе">
      {/* One line you can scroll on phones, wraps on wide screens. The padding leaves room for the focus ring. */}
      <ul className="no-scrollbar -m-1 flex gap-2 overflow-x-auto p-1 sm:flex-wrap sm:overflow-visible">
        {items.map((item) => (
          <li key={item.key} className="shrink-0 sm:max-w-full">
            <Link
              href={item.href}
              aria-current={item.selected ? "true" : undefined}
              className={cn(
                "flex h-11 max-w-64 items-center rounded-full border px-4 text-sm font-bold transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9",
                item.selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-muted",
              )}
            >
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
