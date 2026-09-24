import Link from "next/link";
import { inputClass, labelClass } from "@/components/ui";

type FieldProps = {
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "defaultValue">;

export function Field({ name, label, defaultValue, error, ...inputProps }: FieldProps) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        className={`${inputClass} ${error ? "border-red" : ""}`}
        {...inputProps}
      />
      {error && <span className="mt-1 block px-1 text-sm text-red">{error}</span>}
    </label>
  );
}

type TextAreaFieldProps = {
  name: string;
  label: string;
  defaultValue: string;
  error?: string;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "defaultValue">;

export function TextAreaField({ name, label, defaultValue, error, ...props }: TextAreaFieldProps) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error)}
        className={`${inputClass} min-h-32 resize-y ${error ? "border-red" : ""}`}
        {...props}
      />
      {error && <span className="mt-1 block px-1 text-sm text-red">{error}</span>}
    </label>
  );
}

// Form-level error message plus the Cancel / Save buttons.
export function FormFooter({
  error,
  pending,
  submitLabel,
  cancelHref,
}: {
  error?: string;
  pending: boolean;
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <>
      {error && (
        <p className="rounded-2xl bg-red/10 px-4 py-3 text-sm text-red" aria-live="polite">
          {error}
        </p>
      )}
      <div className="flex gap-3 pt-2">
        <Link
          href={cancelHref}
          className="flex-1 rounded-2xl bg-surface-muted py-3.5 text-center font-semibold"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-2xl bg-accent py-3.5 font-semibold text-accent-foreground transition-opacity disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </>
  );
}
