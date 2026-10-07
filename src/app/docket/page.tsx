import { cookies, headers } from "next/headers";
import { CopyButton } from "@/components/copy-button";
import { DocketHome } from "@/components/docket-home";
import { MailProviderScope } from "@/components/mail-provider";
import { PageScroller } from "@/components/page-scroller";
import { getConnectionSummary } from "@/lib/gmail/connection";
import { createClient } from "@/lib/supabase/server";
import { OUTLOOK_ERROR_COOKIE, adminConsentUrl } from "@/lib/gmail/outlook";

type Message = { tone: "good" | "bad"; text: string };

// Results of the Connect Gmail round trip, from ?gmail=…
const GMAIL_MESSAGES: Record<string, Message> = {
  connected: { tone: "good", text: "Gmail connected." },
  denied: { tone: "bad", text: "Gmail wasn’t connected: permission was declined on Google’s screen." },
  "missing-permission": {
    tone: "bad",
    text: "Gmail wasn’t connected: the “Read your email” permission was unticked. Connect again and leave it ticked.",
  },
  failed: { tone: "bad", text: "Couldn’t connect Gmail. Please try again." },
  "not-configured": { tone: "bad", text: "Gmail isn’t set up on this server yet (missing Google credentials)." },
};

// Results of the Connect Outlook round trip, from ?outlook=…
const OUTLOOK_MESSAGES: Record<string, Message> = {
  connected: { tone: "good", text: "Outlook connected." },
  denied: { tone: "bad", text: "Outlook wasn’t connected: permission was declined on Microsoft’s screen." },
  "missing-permission": {
    tone: "bad",
    text: "Outlook wasn’t connected: Briefcase didn’t get permission to read your email. Connect again and accept.",
  },
  "admin-approval": {
    tone: "bad",
    text: "Outlook wasn’t connected: your school needs an administrator to approve Briefcase first.",
  },
  blocked: {
    tone: "bad",
    text: "Outlook wasn’t connected: your school’s security settings blocked the sign-in. Ask your IT department to allow Briefcase.",
  },
  failed: { tone: "bad", text: "Couldn’t connect Outlook. Please try again." },
  "not-configured": { tone: "bad", text: "Outlook isn’t set up on this server yet (missing Microsoft credentials)." },
};

// Daily Mode: The Docket's home screen (time range, count, Start Reviewing,
// View Shortlist), or a Connect card (Gmail or Outlook) until one is connected.
export default async function DocketPage({ searchParams }: PageProps<"/docket">) {
  const params = await searchParams;
  const outlookResult = typeof params.outlook === "string" ? params.outlook : null;
  const message =
    typeof params.gmail === "string"
      ? GMAIL_MESSAGES[params.gmail]
      : outlookResult
        ? OUTLOOK_MESSAGES[outlookResult]
        : undefined;
  const connection = await getConnectionSummary();
  const counts = connection ? await listCounts() : undefined;
  // Exactly why connecting Outlook didn't work (from Microsoft or the database).
  const reason =
    outlookResult && outlookResult !== "connected" ? (await cookies()).get(OUTLOOK_ERROR_COOKIE)?.value : undefined;

  if (connection) {
    return (
      <MailProviderScope provider={connection.provider}>
        <DocketHome
          connectedEmail={connection.google_email}
          notice={message ? { ...message, reason } : undefined}
          extra={outlookResult === "admin-approval" ? <SchoolApproval reason={reason} /> : undefined}
          counts={counts}
        />
      </MailProviderScope>
    );
  }

  return (
    <PageScroller>
      <p className="text-sm font-semibold tracking-wide text-accent-ink uppercase">Daily Mode</p>
      <h1 className="text-3xl font-bold tracking-tight">The Docket</h1>

      {message && outlookResult !== "admin-approval" && (
        <p
          role="status"
          className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
            message.tone === "good" ? "bg-green/15 text-foreground" : "bg-red/10 text-red"
          }`}
        >
          {message.text}
          {reason && (
            <span className="mt-2 block font-mono text-xs break-words whitespace-pre-wrap" data-connect-reason>
              Details: {reason}
            </span>
          )}
        </p>
      )}
      {outlookResult === "admin-approval" && <SchoolApproval reason={reason} />}

      <ConnectCard />
    </PageScroller>
  );
}

function ConnectCard() {
  return (
    <div className="mt-6 flex flex-col items-center rounded-3xl bg-surface px-6 py-10 text-center">
      <DocketSlip />
      <p className="mt-6 text-lg font-semibold">Bring in film from your inbox</p>
      <p className="mt-1 max-w-xs text-muted">
        Connect your email and The Docket collects YouTube, Hudl and Veo links, plus Google Docs, from the last 30 days.
      </p>
      {/* Plain links, not <Link>: these leave the app for Google's or Microsoft's sign-in. */}
      <a
        href="/api/auth/gmail/start"
        className="mt-6 w-full max-w-xs rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
      >
        Connect Gmail
      </a>
      <a
        href="/api/auth/outlook/start"
        className="mt-3 w-full max-w-xs rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
      >
        Connect Outlook
      </a>
      <p className="mt-3 max-w-xs text-xs text-muted">
        One at a time. Briefcase reads emails with film links; it only sends a reply or deletes an email when you tap
        to. Disconnect anytime.
      </p>
    </div>
  );
}

// The coach's school only lets administrators approve apps that read mail:
// a note to forward to IT, with the link that approves Briefcase for the school.
async function SchoolApproval({ reason }: { reason?: string }) {
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  let link: string;
  try {
    link = adminConsentUrl(origin);
  } catch {
    return null;
  }
  const note = `Hi, I'd like to use Briefcase (a recruiting app) with my school Outlook account. Microsoft says an administrator needs to approve it first. You can review and approve it here: ${link}`;
  return (
    <div className="mt-4 rounded-3xl bg-surface p-5" data-school-approval>
      <p className="font-semibold">Your school needs to approve Briefcase</p>
      <p className="mt-1 text-sm text-muted">
        Your school’s Microsoft settings only let an administrator approve apps that read email. Send this note to your
        IT department; once they approve, tap Connect Outlook again.
      </p>
      <p className="mt-3 rounded-2xl bg-surface-muted px-3 py-2 text-sm break-words select-all" data-it-note>
        {note}
      </p>
      <CopyButton text={note} label="Copy note for IT" />
      {reason && (
        <p className="mt-3 font-mono text-xs break-words whitespace-pre-wrap text-muted" data-connect-reason>
          Details: {reason}
        </p>
      )}
    </div>
  );
}

// A blank docket slip under a brass clip.
function DocketSlip() {
  return (
    <div aria-hidden className="relative pt-3">
      <div className="absolute top-0 left-1/2 h-5 w-12 -translate-x-1/2 rounded-md bg-accent shadow-sm" />
      <div className="w-28 space-y-2.5 rounded-xl border border-border bg-background px-4 pt-6 pb-4 shadow-sm">
        <div className="h-1.5 w-3/4 rounded-full bg-border" />
        <div className="h-1.5 w-full rounded-full bg-border" />
        <div className="h-1.5 w-5/6 rounded-full bg-border" />
        <div className="h-1.5 w-1/2 rounded-full bg-border" />
      </div>
    </div>
  );
}

// How many players are on the Shortlist and Shared with team (seen by all
// staff), for the buttons on The Docket's home.
async function listCounts() {
  const supabase = await createClient();
  const [shortlist, shared] = await Promise.all([
    supabase.from("shortlist").select("id", { count: "exact", head: true }),
    supabase.from("team_shares").select("id", { count: "exact", head: true }),
  ]);
  return { shortlist: shortlist.count ?? 0, shared: shared.count ?? 0 };
}
