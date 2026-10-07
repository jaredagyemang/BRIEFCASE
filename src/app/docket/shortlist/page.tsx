import Link from "next/link";
import { PageScroller } from "@/components/page-scroller";
import { SnapshotListView } from "@/components/snapshot-list";

// The Shortlist, shared by all staff. Each entry is a snapshot of a player's
// Info card and film links, taken when a coach shortlisted them from their
// Docket (other coaches can't see that coach's inbox).
export default function ShortlistPage() {
  return (
    <PageScroller>
      <Link href="/docket" className="-my-2.5 inline-block py-2.5 text-accent-ink">
        ‹ The Docket
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Shortlist</h1>
      <p className="text-muted">Shared with all staff. Add players with ☆ Shortlist on their Info card.</p>
      <SnapshotListView list="shortlist" empty="Nobody on the Shortlist yet." addedLabel="Added by" />
    </PageScroller>
  );
}
