export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-3xl bg-surface p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-muted">Coming in V2.</p>
    </div>
  );
}
