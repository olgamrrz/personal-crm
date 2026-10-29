import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

// Landing colors; each circle stays visible both on white and on the blue panel
const PALETTE = [
  "bg-cobalt text-cream",
  "bg-mist-100 text-cobalt-700",
  "bg-cobalt-900 text-cream",
  "bg-cream text-cobalt-700",
  "bg-cobalt-soft text-cream",
  "bg-mist text-cobalt-900",
];

export function ContactAvatar({
  id,
  name,
  className,
}: {
  id: number;
  name: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        PALETTE[id % PALETTE.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
