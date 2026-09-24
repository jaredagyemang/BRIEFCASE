import { statusMeta, type LifecycleStatus } from "@/lib/players";

export function StatusPill({ status }: { status: LifecycleStatus }) {
  const meta = statusMeta(status);
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${meta.pill}`}>
      {meta.label}
    </span>
  );
}
