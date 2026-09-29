"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { acceptTermsAction } from "@/app/welcome/actions";
import { LegalText } from "@/components/legal-text";

// The Privacy Policy and Terms of Use, read to the end before "I agree".
// Not agreeing signs the coach out: nothing else in the app is open to them.
export function TermsGate({
  version,
  draft,
  privacy,
  terms,
  next,
}: {
  version: string;
  draft: boolean;
  privacy: string;
  terms: string;
  next: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(acceptTermsAction, null);
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);

  // "I agree" opens up once the end of the text has been on screen.
  useEffect(() => {
    if (!end.current || !scroller.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setReadToEnd(true);
      },
      { root: scroller.current, threshold: 1 },
    );
    observer.observe(end.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-3">
        {draft && (
          <p
            className="mb-3 inline-block rounded-full bg-yellow/20 px-3 py-1 text-xs font-semibold text-yellow"
            data-legal-draft
          >
            Draft — under legal review
          </p>
        )}
        <h1 className="text-3xl font-bold tracking-tight">Before you start</h1>
        <p className="mt-1 text-muted">Please read the Privacy Policy and Terms of Use, then agree to continue.</p>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto" data-legal-scroller>
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 pb-6">
          <section className="rounded-3xl bg-surface p-5" aria-labelledby="privacy-policy">
            <h2 id="privacy-policy" className="text-xl font-semibold">
              Privacy Policy
            </h2>
            <div className="mt-3">
              <LegalText text={privacy} />
            </div>
          </section>
          <section className="rounded-3xl bg-surface p-5" aria-labelledby="terms-of-use">
            <h2 id="terms-of-use" className="text-xl font-semibold">
              Terms of Use
            </h2>
            <div className="mt-3">
              <LegalText text={terms} />
            </div>
          </section>
          <div ref={end} className="h-px" data-legal-end />
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl border-t border-border px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {state?.error && (
          <p role="alert" className="mb-3 rounded-2xl bg-red/10 px-4 py-3 text-sm text-red">
            {state.error}{" "}
            {"outdated" in state && state.outdated && (
              <button type="button" onClick={() => router.refresh()} className="font-semibold underline">
                Show the new version
              </button>
            )}
          </p>
        )}
        <form action={formAction}>
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            disabled={!readToEnd || pending}
            className="w-full rounded-2xl bg-accent py-4 text-lg font-semibold text-accent-foreground disabled:opacity-40"
          >
            {pending ? "Saving…" : "I agree"}
          </button>
        </form>
        {!readToEnd && <p className="mt-2 text-center text-xs text-muted">Scroll to the end to continue.</p>}
        <form action={signOut} className="mt-2 text-center">
          <button type="submit" className="py-2 text-sm font-medium text-muted">
            I don’t agree — sign out
          </button>
        </form>
      </div>
    </div>
  );
}
