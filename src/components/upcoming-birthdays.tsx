import Link from "next/link";

import { ContactAvatar } from "@/components/contact-avatar";
import { formatBirthdayDate, formatDaysUntil } from "@/lib/birthday";
import type { UpcomingBirthday } from "@/lib/contacts";
import { cn } from "@/lib/utils";

// The "Скоро день рождения" block on the home page: birthdays today and in the next 6 days.
// Nothing here changes by itself, and a row has no buttons, so a row is one link to the card and
// the block is a Server Component. No birthdays soon: no block.
export function UpcomingBirthdays({ birthdays }: { birthdays: UpcomingBirthday[] }) {
  if (birthdays.length === 0) return null;

  return (
    // A light panel, so it does not merge with the dark blue "Пора связаться" above or the white list below
    <section
      aria-labelledby="birthdays-title"
      className="overflow-hidden rounded-panel bg-mist-100 pb-2 sm:rounded-panel-lg"
    >
      <div className="flex items-baseline gap-2 px-5 pt-5 pb-3 sm:px-7 sm:pt-6">
        <h2 id="birthdays-title" className="font-serif text-heading font-medium sm:text-heading-lg">
          Скоро день рождения
        </h2>
        <span className="text-sm text-muted-foreground">({birthdays.length})</span>
      </div>
      <ul>
        {birthdays.map((birthday) => {
          const when = formatDaysUntil(birthday.daysUntil);
          return (
            <li key={birthday.id} className="border-t border-cream-line">
              <Link
                href={`/contacts/${birthday.id}`}
                className="flex min-h-11 items-center gap-3 px-5 py-3 transition-colors hover:bg-card/60 focus-visible:bg-card/60 focus-visible:outline-none sm:gap-4 sm:px-7"
              >
                <ContactAvatar id={birthday.id} name={birthday.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{birthday.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatBirthdayDate(birthday.day, birthday.month)}
                    {birthday.turning !== null && <> · исполняется {birthday.turning}</>}
                  </div>
                  {/* On phones the time left goes under the date; on wide screens it is on the right */}
                  <div
                    className={cn("text-sm font-medium sm:hidden", birthday.daysUntil === 0 && "font-bold")}
                  >
                    {when}
                  </div>
                </div>
                <div
                  className={cn(
                    "hidden shrink-0 text-sm font-medium whitespace-nowrap sm:block",
                    birthday.daysUntil === 0 && "font-bold",
                  )}
                >
                  {when}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
