import { redirect } from "next/navigation";
import { DocketFeed } from "@/components/docket-feed";
import { getConnectionSummary } from "@/lib/gmail/connection";
import { rangeFor } from "@/lib/gmail/docket-types";
import { getCurrentUser } from "@/lib/staff";

// The swipeable review feed, for the time range picked on The Docket's home.
export default async function DocketReviewPage({ searchParams }: PageProps<"/docket/review">) {
  const params = await searchParams;
  const [connection, user] = await Promise.all([getConnectionSummary(), getCurrentUser()]);
  if (!connection) redirect("/docket");
  return (
    <DocketFeed
      connectedEmail={connection.google_email}
      coachName={user?.name ?? "Coach"}
      range={rangeFor(typeof params.range === "string" ? params.range : null).id}
    />
  );
}
