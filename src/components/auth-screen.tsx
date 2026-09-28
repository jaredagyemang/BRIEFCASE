import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

// The frame for the signed-out screens after sign-in (forgot and reset
// password): the logo, a title and a way back to sign in.
export function AuthScreen({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center">
      <div className="text-center">
        <BrandLogo variant="full" className="mx-auto w-36" />
        <h1 className="mt-6 text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      <div className="mt-6">{children}</div>
      <Link href="/login" className="mt-6 self-center text-sm font-semibold text-accent-ink">
        ‹ Back to sign in
      </Link>
    </div>
  );
}
