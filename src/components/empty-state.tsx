// A centered message with an icon, shown instead of an empty list
export function EmptyState({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-card px-6 py-12 text-center text-muted-foreground sm:rounded-card-lg">
      <span className="flex size-12 items-center justify-center rounded-full bg-mist-100 text-foreground">
        {icon}
      </span>
      <p>{children}</p>
    </div>
  );
}
