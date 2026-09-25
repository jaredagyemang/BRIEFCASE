// Daily Mode. A placeholder for now; its real content comes next.
export default function DocketPage() {
  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-accent-ink uppercase">Daily Mode</p>
      <h1 className="text-3xl font-bold tracking-tight">The Docket</h1>

      <div className="mt-6 flex flex-col items-center rounded-3xl bg-surface px-6 py-12 text-center">
        <DocketSlip />
        <p className="mt-6 text-lg font-semibold">Nothing on the docket yet</p>
        <p className="mt-1 max-w-xs text-muted">This is where your day will come together. It’s being built next.</p>
      </div>
    </div>
  );
}

// A blank docket slip under a brass clip.
function DocketSlip() {
  return (
    <div aria-hidden className="relative pt-3">
      <div className="absolute top-0 left-1/2 h-5 w-12 -translate-x-1/2 rounded-md bg-accent shadow-sm" />
      <div className="w-28 space-y-2.5 rounded-xl border border-border bg-background px-4 pt-6 pb-4 shadow-sm">
        <div className="h-1.5 w-3/4 rounded-full bg-border" />
        <div className="h-1.5 w-full rounded-full bg-border" />
        <div className="h-1.5 w-5/6 rounded-full bg-border" />
        <div className="h-1.5 w-1/2 rounded-full bg-border" />
      </div>
    </div>
  );
}
