import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { PageHelp, ToursScope } from "@/components/page-help";
import { ProfileEmail } from "@/components/profile-email";
import { ReplayToursButton } from "@/components/replay-tours-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getConnectionSummary } from "@/lib/gmail/connection";
import { getCurrentUser } from "@/lib/staff";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { seenTours } from "@/lib/tours";
import { NameForm } from "./name-form";
import { ReportProblemLink } from "@/components/report-problem";

export default async function ProfilePage() {
  const [user, gmail] = await Promise.all([getCurrentUser(), getConnectionSummary()]);
  if (!user) redirect("/login");
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const tours = await seenTours();

  return (
    <ToursScope seen={tours}>
      <div className="relative flex flex-col items-center pt-2 text-center">
        <PageHelp tour="profile" className="absolute top-0 right-0" />
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-3xl font-semibold text-accent-foreground">
          {user.name[0]?.toUpperCase()}
        </div>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{user.name}</h1>
        <p className="text-muted">{user.email}</p>
      </div>

      <h2 className="mt-8 mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">Account</h2>
      <div className="divide-y divide-border overflow-hidden rounded-3xl bg-surface" data-tour="profile-name">
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

      <h2 className="mt-8 mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">Email</h2>
      <div data-tour="profile-email">
        <ProfileEmail connection={gmail ? { email: gmail.google_email, provider: gmail.provider } : null} />
      </div>
      <p className="mt-2 px-1 text-sm text-muted">The Docket reads this inbox for recruiting emails with film.</p>

      <h2 className="mt-8 mb-2 px-1 text-sm font-semibold tracking-wide text-muted uppercase">Appearance</h2>
      <div data-tour="profile-appearance">
        <ThemeToggle initial={theme} />
      </div>

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="w-full rounded-2xl bg-red/10 py-3.5 font-semibold text-red transition-colors active:bg-red/20"
        >
          Sign out
        </button>
      </form>

      <div className="mt-4" data-tour="profile-replay">
        <Link
          href="/welcome?replay=1&next=%2Fprofile"
          className="block py-2.5 text-center text-sm font-semibold text-accent-ink"
          data-replay-tutorial
        >
          Replay tutorial
        </Link>
        <ReplayToursButton />
      </div>
      <div className="text-center" data-tour="profile-report">
        <ReportProblemLink />
      </div>
      <p className="mt-4 text-center text-xs text-muted">Version {process.env.APP_VERSION}</p>
    </ToursScope>
  );
}
