import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Briefcase",
  description: "Lean recruiting for coaches and recruiters.",
  // Added to an iPhone or iPad Home Screen, it opens full screen as its own
  // app, named Briefcase, with the status bar above the page (not over it).
  appleWebApp: { capable: true, title: "Briefcase", statusBarStyle: "default" },
  // Next.js writes the newer mobile-web-app-capable; older iOS reads this one.
  other: { "apple-mobile-web-app-capable": "yes" },
};

const BACKGROUND = { light: "#f5f5f7", dark: "#000000" };

// The status bar (and browser bar) takes the page's background: the theme
// picked on Profile, or the device's setting on Auto.
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: BACKGROUND.light },
            { media: "(prefers-color-scheme: dark)", color: BACKGROUND.dark },
          ]
        : BACKGROUND[theme],
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-dvh flex-col overflow-hidden font-sans">
        <AppNav />
        {/* Each screen scrolls inside its own PageScroller, not the document. */}
        <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
