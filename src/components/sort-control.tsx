"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DEFAULT_DIR, SORT_LABEL, dirLabel, type Sort, type SortBy } from "@/lib/sort";

// "Sort: [Last edited ▾] [↓ Newest first]". The choice is saved on this
// device (a cookie) and the list reloads in the new order.
export function SortControl({ cookie, options, value }: { cookie: string; options: SortBy[]; value: Sort }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: Sort) {
    document.cookie = `${cookie}=${next.by}:${next.dir}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <div className={`flex items-center justify-end gap-2 text-sm transition-opacity ${pending ? "opacity-60" : ""}`}>
      <label className="flex items-center gap-1.5 text-muted">
        Sort
        <select
          value={value.by}
          onChange={(e) => {
            const by = e.target.value as SortBy;
            choose({ by, dir: DEFAULT_DIR[by] });
          }}
          className="hit relative rounded-full bg-surface-muted px-3 py-1.5 font-semibold text-foreground outline-none focus:ring-4 focus:ring-accent/15"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {SORT_LABEL[o]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => choose({ by: value.by, dir: value.dir === "desc" ? "asc" : "desc" })}
        aria-label={`Order: ${dirLabel(value.by, value.dir)}. Tap to reverse.`}
        className="hit relative flex items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5 font-semibold"
      >
        <span aria-hidden>{value.dir === "desc" ? "↓" : "↑"}</span>
        {dirLabel(value.by, value.dir)}
      </button>
    </div>
  );
}
