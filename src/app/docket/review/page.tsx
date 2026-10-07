import { redirect } from "next/navigation";
import { DocketFeed } from "@/components/docket-feed";
import { HintsScope } from "@/components/hints";
import { MailProviderScope } from "@/components/mail-provider";
import { getConnectionSummary } from "@/lib/gmail/connection";
import { rangeFor } from "@/lib/gmail/docket-types";
import { seenHints } from "@/lib/hints";
import { getCurrentUser } from "@/lib/staff";

// The swipeable review feed, for the time range picked on The Docket's home.
export default async function DocketReviewPage({ searchParams }: PageProps<"/docket/review">) {
  const params = await searchParams;
  const [connection, user, hints] = await Promise.all([getConnectionSummary(), getCurrentUser(), seenHints()]);
  if (!connection) redirect("/docket");
  return (
    <MailProviderScope provider={connection.provider}>
      <HintsScope seen={hints}>
        <DocketFeed
          connectedEmail={connection.google_email}
          coachName={user?.name ?? "Coach"}
          range={rangeFor(typeof params.range === "string" ? params.range : null).id}
        />
      </HintsScope>
    </MailProviderScope>
  );
}
