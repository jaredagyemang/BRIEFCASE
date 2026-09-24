"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Search box that keeps ?q= in the URL (debounced) so results are server-rendered.
export function PlayerSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (value.trim() === current) return;

    const timeout = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (value.trim()) params.set("q", value.trim());
      else params.delete("q");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timeout);
  }, [value, searchParams, pathname, router]);

  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search name, club, position"
        aria-label="Search players"
        className="w-full rounded-full bg-surface-muted py-3 pr-4 pl-11 text-base outline-none focus:ring-4 focus:ring-accent/15 placeholder:text-muted"
      />
    </div>
  );
}
