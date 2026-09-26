"use client";

import { useEffect, useState } from "react";

// A photo of handwriting, shown full screen and pinch-zoomable. Tap anywhere
// (or press Escape) to close.
export function PhotoViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex justify-end p-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white"
        >
          Close
        </button>
      </div>
      <button type="button" onClick={onClose} aria-label="Close photo" className="min-h-0 flex-1 overflow-auto p-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed or local photo */}
        <img src={src} alt={alt} className="mx-auto max-h-full w-auto max-w-full object-contain" />
      </button>
    </div>
  );
}

// A small thumbnail of a handwriting photo that opens it full screen.
export function PhotoThumb({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View ${alt.toLowerCase()}`}
        className={`shrink-0 overflow-hidden rounded-xl bg-surface-muted ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed or local photo */}
        <img src={src} alt="" className="h-full w-full object-cover" />
      </button>
      {open && <PhotoViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
