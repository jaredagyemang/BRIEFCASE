"use client";

import { useState } from "react";

// Copies text to the clipboard, saying so for a moment.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => {},
        )
      }
      className="mt-3 w-full rounded-2xl bg-accent py-3 font-semibold text-accent-foreground"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
