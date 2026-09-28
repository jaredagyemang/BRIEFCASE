import type { ActivityEntry } from "@/lib/gmail/docket-types";
import { TEMPLATE_LABEL } from "@/lib/gmail/templates";
import { timeAgo } from "@/lib/time";

// One line of team activity: "Coach Rivera shared Maya Johnson with the team
// · “not sure about position fit” · 2 hours ago".
export function ActivityLine({ entry }: { entry: ActivityEntry }) {
  const player = <span className="font-semibold">{entry.player ?? "a player"}</span>;
  const what = {
    shortlisted: <>shortlisted {player}</>,
    unshortlisted: <>removed {player} from the Shortlist</>,
    shared: <>shared {player} with the team</>,
    unshared: <>removed {player} from Shared with team</>,
    replied: (
      <>
        replied {entry.template ? TEMPLATE_LABEL[entry.template] : ""} to {player}
      </>
    ),
  }[entry.action];
  return (
    <p className="text-sm break-words" data-activity-line>
      <span className="font-semibold">{entry.actor}</span> {what}
      {entry.note && <span className="text-muted"> · “{entry.note}”</span>}
      <span className="text-muted"> · {timeAgo(entry.at)}</span>
    </p>
  );
}
