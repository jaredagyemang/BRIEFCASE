import Link from "next/link";
import { PageScroller } from "@/components/page-scroller";
import { SnapshotListView } from "@/components/snapshot-list";

// "Shared with team": Info cards any coach shared from their Docket for all
// staff to see, newest first. Separate from the Shortlist.
export default function SharedWithTeamPage() {
  return (
    <PageScroller>
      <Link href="/docket" className="text-accent-ink">
        ‹ The Docket
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Shared with team</h1>
      <p className="text-muted">Seen by all staff. Share a player with ↗ Share to team on their Info card.</p>
      <SnapshotListView list="shared" empty="Nothing shared with the team yet." addedLabel="Shared by" />
    </PageScroller>
  );
}
