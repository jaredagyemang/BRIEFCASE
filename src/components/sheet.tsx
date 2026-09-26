"use client";

import { useEffect } from "react";

// Bottom sheet on phones, centered dialog on larger screens.
export function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md space-y-3 rounded-t-3xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        {children}
      </div>
    </div>
  );
}

export function SheetTitle({
  icon,
  title,
  subtitle,
}: {
  icon?: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="pb-2 text-center">
      {icon}
      <p className="text-lg font-semibold">{title}</p>
      <p className="text-muted">{subtitle}</p>
    </div>
  );
}

const SHEET_BUTTON_STYLES = {
  primary: "bg-accent text-accent-foreground",
  danger: "bg-red text-white",
  secondary: "bg-surface-muted",
};

export function SheetButton({
  variant = "secondary",
  ...props
}: { variant?: keyof typeof SHEET_BUTTON_STYLES } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`w-full rounded-2xl py-3.5 font-semibold transition disabled:opacity-60 ${SHEET_BUTTON_STYLES[variant]}`}
      {...props}
    />
  );
}
