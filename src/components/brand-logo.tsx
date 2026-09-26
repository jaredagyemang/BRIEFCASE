import Image from "next/image";
import logoDark from "@/assets/brand/logo-dark.png";
import logoLight from "@/assets/brand/logo-light.png";
import markDark from "@/assets/brand/mark-dark.png";
import markLight from "@/assets/brand/mark-light.png";
import wordmarkDark from "@/assets/brand/wordmark-dark.png";
import wordmarkLight from "@/assets/brand/wordmark-light.png";

// The Briefcase logo in the version for the active theme. Both versions are
// in the page and CSS shows one (Tailwind's dark: variant follows the device
// setting or the Light/Dark choice on Profile), so the right one appears
// from the first paint, with no flash.
//
// "full": the whole logo, for the sign-in screen.
// "compact": the briefcase mark and BRIEFCASE wordmark side by side, sized
// for the header.
export function BrandLogo({ variant, className = "" }: { variant: "full" | "compact"; className?: string }) {
  if (variant === "full") {
    return (
      <span className={`block ${className}`}>
        <Image
          src={logoLight}
          alt="Briefcase — Soccer Recruiting"
          loading="eager"
          className="h-auto w-full dark:hidden"
        />
        <Image
          src={logoDark}
          alt="Briefcase — Soccer Recruiting"
          loading="eager"
          className="hidden h-auto w-full dark:block"
        />
      </span>
    );
  }
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <Image src={markLight} alt="" loading="eager" className="h-8 w-auto dark:hidden" />
      <Image src={markDark} alt="" loading="eager" className="hidden h-8 w-auto dark:block" />
      <Image src={wordmarkLight} alt="Briefcase" loading="eager" className="h-[1.05rem] w-auto dark:hidden" />
      <Image src={wordmarkDark} alt="Briefcase" loading="eager" className="hidden h-[1.05rem] w-auto dark:block" />
    </span>
  );
}
