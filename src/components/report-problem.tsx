"use client";

import { useState, useTransition } from "react";
import { reportProblemAction } from "@/app/report-actions";
import { Sheet, SheetButton, SheetTitle } from "@/components/sheet";
import { inputClass } from "@/components/ui";
import { REPORT_MAX } from "@/lib/problem-report";

// "Report a problem": a link that opens the form. On Profile and in each
// page's "?" help panel.
export function ReportProblemLink({ className = "", onOpen }: { className?: string; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          onOpen?.();
          setOpen(true);
        }}
        className={`py-2.5 text-sm font-semibold text-accent-ink ${className}`}
        data-report-problem
      >
        Report a problem
      </button>
      {open && <ReportProblemSheet onClose={() => setOpen(false)} />}
    </>
  );
}

// The form: what went wrong (required, up to 1,000 characters), Send and
// Cancel, then a short thank-you. Sent with the page (without ids or search
// terms), the screen size, and (added by the server) the browser/device and
// app version. Nothing else.
export function ReportProblemSheet({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, startSending] = useTransition();

  function send() {
    setError(null);
    startSending(async () => {
      const result = await reportProblemAction({
        message: text,
        page: window.location.pathname,
        screen: `${window.innerWidth}x${window.innerHeight}@${Math.round(window.devicePixelRatio * 100) / 100}`,
      }).catch(() => ({ ok: false as const, error: "Couldn’t send your report. Check your connection and try again." }));
      if (result.ok) setSent(true);
      else setError(result.error);
    });
  }

  if (sent) {
    return (
      <Sheet onClose={onClose}>
        <div role="status" data-report-sent>
          <SheetTitle title="Thanks for letting us know" subtitle="Your report was sent. We’ll look into it." />
        </div>
        <SheetButton variant="primary" onClick={onClose}>
          Done
        </SheetButton>
      </Sheet>
    );
  }

  const left = REPORT_MAX - text.length;
  return (
    <Sheet onClose={() => !sending && onClose()}>
      <SheetTitle title="Report a problem" subtitle="Tell us what went wrong and what you were trying to do." />
      <label className="block">
        <span className="sr-only">What went wrong</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, REPORT_MAX))}
          maxLength={REPORT_MAX}
          rows={5}
          required
          autoFocus
          placeholder="What happened?"
          className={`${inputClass} resize-none`}
          data-report-text
        />
      </label>
      <p className="flex justify-between gap-3 px-1 text-xs text-muted">
        <span>Please don’t include player names or contact details.</span>
        <span className="shrink-0 tabular-nums" aria-live="polite">
          {left < 200 ? `${left} left` : ""}
        </span>
      </p>
      {error && (
        <p role="alert" className="px-1 text-sm text-red">
          {error}
        </p>
      )}
      <SheetButton variant="primary" disabled={sending || !text.trim()} onClick={send}>
        {sending ? "Sending…" : "Send"}
      </SheetButton>
      <SheetButton disabled={sending} onClick={onClose}>
        Cancel
      </SheetButton>
    </Sheet>
  );
}
