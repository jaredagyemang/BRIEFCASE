import { redirect } from "next/navigation";
import { ActivityLine } from "@/components/activity-line";
import { BackButton } from "@/components/back-button";
import { PageScroller } from "@/components/page-scroller";
import { SnapshotCard, loadSnapshot } from "@/components/snapshot-list";
import { loadActivityEntry } from "@/lib/gmail/activity";

// One line of team activity, opened. From this coach's own inbox: their Info
// card. From another coach's: the copy shared with the team (Shared with
// team or the Shortlist), or, if it was never shared, just what happened.
export default async function ActivityEntryPage({ params }: PageProps<"/docket/activity/[id]">) {
  const { id } = await params;
  const found = await loadActivityEntry(id);

  if (!found) {
    return (
      <PageScroller>
        <BackButton />
        <div className="mt-6 rounded-3xl bg-surface p-6 text-center" data-activity-missing>
          <p className="font-semibold">Couldn’t find that activity</p>
        </div>
      </PageScroller>
    );
  }

  const { entry, mine, messageId, sourceName, shared } = found;
  if (mine) redirect(`/docket/card/${encodeURIComponent(messageId)}?from=activity`);
  const snapshot = shared ? await loadSnapshot(shared.list, shared.id) : null;

  return (
    <PageScroller>
      <BackButton />
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{entry.player ?? "A player"}</h1>
      <div className="mt-2">
        <ActivityLine entry={entry} />
      </div>
      {snapshot && shared ? (
        <div className="mt-6" data-activity-snapshot={shared.list}>
          <SnapshotCard
            row={snapshot}
            list={shared.list}
            addedLabel={shared.list === "shared" ? "Shared by" : "Shortlisted by"}
          />
        </div>
      ) : (
        <p className="mt-6 rounded-3xl bg-surface p-6 text-sm text-muted" data-activity-unshared>
          This came from {sourceName ? `${sourceName}’s` : "a former staff member’s"} inbox and wasn’t shared with the
          team, so there’s no Info card to open.
        </p>
      )}
    </PageScroller>
  );
}
