export function DetailList({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="mt-6 divide-y divide-border overflow-hidden rounded-3xl bg-surface">
      {items.map((d) => (
        <div key={d.label} className="flex justify-between gap-4 px-4 py-3.5">
          <dt className="shrink-0 text-muted">{d.label}</dt>
          <dd className="truncate text-right font-medium">{d.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
