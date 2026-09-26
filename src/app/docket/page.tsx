import { DocketFeed } from "@/components/docket-feed";
import { PageScroller } from "@/components/page-scroller";
import { getConnectionSummary } from "@/lib/gmail/connection";

// Results of the Connect Gmail round trip, from ?gmail=…
const MESSAGES: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Gmail connected." },
  denied: { tone: "bad", text: "Gmail wasn’t connected: permission was declined on Google’s screen." },
  "missing-permission": {
    tone: "bad",
    text: "Gmail wasn’t connected: the “Read your email” permission was unticked. Connect again and leave it ticked.",
  },
  failed: { tone: "bad", text: "Couldn’t connect Gmail. Please try again." },
  "not-configured": { tone: "bad", text: "Gmail isn’t set up on this server yet (missing Google credentials)." },
};

// Daily Mode: a full-screen feed of the film (and Google Docs) coaches are
// sent by email, or a Connect Gmail card until Gmail is connected.
export default async function DocketPage({ searchParams }: PageProps<"/docket">) {
  const params = await searchParams;
  const message = typeof params.gmail === "string" ? MESSAGES[params.gmail] : undefined;
  const connection = await getConnectionSummary();

  if (connection) {
    return (
      <DocketFeed
        connectedEmail={connection.google_email}
        notice={message?.tone === "good" ? message.text : undefined}
      />
    );
  }

  return (
    <PageScroller>
      <p className="text-sm font-semibold tracking-wide text-accent-ink uppercase">Daily Mode</p>
      <h1 className="text-3xl font-bold tracking-tight">The Docket</h1>

      {message && (
        <p
          role="status"
          className={`mt-4 rounded-2xl px-4 py-3 text-sm font-medium ${
            message.tone === "good" ? "bg-green/15 text-foreground" : "bg-red/10 text-red"
          }`}
        >
          {message.text}
        </p>
      )}

      <ConnectGmailCard />
    </PageScroller>
  );
}

function ConnectGmailCard() {
  return (
    <div className="mt-6 flex flex-col items-center rounded-3xl bg-surface px-6 py-10 text-center">
      <DocketSlip />
      <p className="mt-6 text-lg font-semibold">Bring in film from your inbox</p>
      <p className="mt-1 max-w-xs text-muted">
        Connect Gmail and The Docket collects YouTube, Hudl and Veo links, plus Google Docs, from the last 30 days of
        email.
      </p>
      {/* A plain link, not <Link>: this leaves the app for Google's sign-in. */}
      <a
        href="/api/auth/gmail/start"
        className="mt-6 w-full max-w-xs rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground"
      >
        Connect Gmail
      </a>
      <p className="mt-3 max-w-xs text-xs text-muted">
        Read-only: Briefcase can’t send, delete or change anything in your email. Disconnect anytime.
      </p>
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
