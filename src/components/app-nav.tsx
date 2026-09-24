"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/login/actions";

const tabs = [
  { href: "/players", label: "Players", icon: "🏃" },
  { href: "/coaches", label: "Coaches", icon: "📇" },
];

// Top bar on larger screens, iOS-style bottom tab bar on phones.
export function AppNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/login")) return null;

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            💼 Briefcase
          </Link>
          <div className="flex items-center gap-1">
          <nav className="hidden gap-1 sm:flex">
            {tabs.map((tab) => {
              const active = pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-foreground text-background"
                      : "text-muted hover:bg-surface-muted"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          <form action={signOut}>
            <button type="submit" className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-surface-muted">
              Sign out
            </button>
          </form>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
        <div className="mx-auto flex max-w-3xl">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <span className="text-xl leading-none">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
