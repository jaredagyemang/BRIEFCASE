import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/staff";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { NameForm } from "./name-form";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div>
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-3xl font-semibold text-accent-foreground">
          {user.name[0]?.toUpperCase()}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{user.name}</h1>
        <p className="text-muted">{user.email}</p>
      </div>

      <h2 className="mt-8 mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        Account
      </h2>
      <div className="divide-y divide-border overflow-hidden rounded-3xl bg-surface">
        {user.hasProfile ? (
          <NameForm name={user.name} />
        ) : (
          <div className="flex justify-between gap-4 px-4 py-3.5">
            <span className="text-muted">Name</span>
            <span className="truncate font-medium">{user.name}</span>
          </div>
        )}
        <div className="flex justify-between gap-4 px-4 py-3.5">
          <span className="text-muted">Email</span>
          <span className="truncate font-medium">{user.email}</span>
        </div>
      </div>
      <p className="mt-2 px-1 text-sm text-muted">Your name appears next to the ratings you make.</p>

      <h2 className="mt-8 mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">
        Appearance
      </h2>
      <ThemeToggle initial={theme} />

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="w-full rounded-2xl bg-red/10 py-3.5 font-semibold text-red transition-colors active:bg-red/20"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
