import { signOut } from "@/app/login/actions";
import { SessionRenewal } from "@/components/session-renewal";
import { getCurrentUser } from "@/lib/session";

export function HeaderDot() {
  return <span aria-hidden className="size-2.5 rounded-full bg-cream" />;
}

// The address of the signed-in person and «Выйти», in the header. A dot for a person who is not signed in.
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return <HeaderDot />;
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <SessionRenewal />
      <span className="min-w-0 truncate text-sm text-cream">{user.email}</span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-cream px-3.5 py-1.5 text-sm font-bold whitespace-nowrap text-cream transition-colors hover:bg-cream hover:text-cobalt focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cream"
        >
          Выйти
        </button>
      </form>
    </div>
  );
}
