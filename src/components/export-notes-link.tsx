"use client";

// Downloads every note from the event as an Excel file. The coach's time zone
// is added when tapped, so the Date column matches their clock.
export function ExportNotesLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      onClick={(e) => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) e.currentTarget.href = `${href}?tz=${encodeURIComponent(tz)}`;
      }}
      className="shrink-0 text-sm font-semibold text-accent-ink"
    >
      ⬇︎ Export notes
    </a>
  );
}
