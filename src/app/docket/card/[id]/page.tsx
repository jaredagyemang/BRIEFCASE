import Link from "next/link";
import { redirect } from "next/navigation";
import { SingleCard } from "@/components/docket-feed";
import { PageScroller } from "@/components/page-scroller";
import { MailProviderScope } from "@/components/mail-provider";
import { getConnectionSummary } from "@/lib/gmail/connection";
import { loadDocketCard } from "@/lib/gmail/docket";
import { mailLabels } from "@/lib/mail/labels";
import { getCurrentUser } from "@/lib/staff";

// One player's Info card and video(s) on their own, opened from The Docket's
// search or staff activity. ?from=search or ?from=activity makes ‹ Back return
// there as it was.
export default async function DocketCardPage({ params, searchParams }: PageProps<"/docket/card/[id]">) {
  const [{ id: rawId }, query] = await Promise.all([params, searchParams]);
  // Outlook's message ids contain "=", which arrives still encoded.
  const id = safeDecode(rawId);
  const [result, user, connection] = await Promise.all([loadDocketCard(id), getCurrentUser(), getConnectionSummary()]);
  const mail = mailLabels(connection?.provider);
  if (result.status === "not_connected") redirect("/docket");

  if (result.status === "ok") {
    return (
      <MailProviderScope provider={connection?.provider ?? "google"}>
        <SingleCard
          initial={result.email}
          card={result.card}
          inTrash={result.inTrash}
          canSend={result.canSend}
          canDelete={result.canDelete}
          coachName={user?.name ?? "Coach"}
          fromList={query.from === "search" || query.from === "activity"}
        />
      </MailProviderScope>
    );
  }

  const message =
    result.status === "not_found"
      ? {
          title: "That email is gone",
          text: `It’s no longer in your ${mail.name} (it may have been deleted for good).`,
        }
      : result.status === "expired"
        ? {
            title: `${mail.name} needs reconnecting`,
            text: `${mail.company} stopped accepting this connection (it expired or access was removed). Connect again to open this card.`,
          }
        : { title: "Couldn’t open this card", text: result.message };

  return (
    <PageScroller>
      <Link href="/docket" className="-my-2.5 inline-block py-2.5 text-sm font-semibold text-accent-ink">
        ‹ The Docket
      </Link>
      <div className="mt-6 rounded-3xl bg-surface p-6 text-center" data-card-error={result.status}>
        <p className="font-semibold">{message.title}</p>
        <p className="mt-1 text-sm text-muted">{message.text}</p>
        {result.status === "expired" && (
          <a
            href={mail.connectPath}
            className="mt-4 inline-block rounded-2xl bg-accent px-6 py-3 font-semibold text-accent-foreground"
          >
            Reconnect {mail.name}
          </a>
        )}
      </div>
    </PageScroller>
  );
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
