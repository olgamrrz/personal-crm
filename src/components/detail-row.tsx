import { cn } from "@/lib/utils";

// One "label: value" row of the contact card; goes inside a <dl>
export function DetailRow({
  icon,
  label,
  labelId,
  withControl = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  labelId?: string;
  // The value holds a 36px control: on wide screens keep the label level with it,
  // even when a message appears below the control
  withControl?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt
        id={labelId}
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground",
          withControl && "sm:h-9 sm:self-start",
        )}
      >
        {icon}
        {label}
      </dt>
      <dd className="-mt-3 pl-6 sm:mt-0 sm:pl-0">
        {children || <span className="text-muted-foreground">не указано</span>}
      </dd>
    </>
  );
}
