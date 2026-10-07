import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The Connect Gmail / Connect Outlook round trip when Briefcase is installed on
// an iPhone or iPad Home Screen (see components/connect-mail-link.tsx).

type Provider = "gmail" | "outlook";
const NAME = { gmail: "Gmail", outlook: "Outlook" };

// Remembered from "start" to "callback": the sign-in ran in the app's own
// sign-in window (?window=1), which reports back to the app and closes.
const WINDOW_COOKIE = "mail_connect_window";

export function rememberWindow(request: NextRequest, response: NextResponse, provider: Provider) {
  if (request.nextUrl.searchParams.get("window") !== "1") return;
  response.cookies.set(WINDOW_COOKIE, "1", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: `/api/auth/${provider}`,
    maxAge: 10 * 60,
  });
}

// Where the result goes: The Docket, as before, or (in the sign-in window) a
// page that passes it to the app and closes.
export function resultRedirect(request: NextRequest, provider: Provider, result: string) {
  const inWindow = request.cookies.get(WINDOW_COOKIE)?.value === "1";
  const path = inWindow ? `/connected?provider=${provider}&result=${result}` : `/docket?${provider}=${result}`;
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
  response.cookies.delete({ name: WINDOW_COOKIE, path: `/api/auth/${provider}` });
  return response;
}

export async function isSignedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return Boolean(data?.claims);
}

// The round trip ended up somewhere without the coach's Briefcase sign-in:
// most likely Safari, when Briefcase is installed on the Home Screen (iPhone
// and iPad keep the two separate). Nothing was connected; say how to finish.
export function handoffPage(provider: Provider) {
  const name = NAME[provider];
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Briefcase</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:12vh auto;padding:0 1.5rem;line-height:1.5;color:#111114;background:#f5f5f7}h1{font-size:1.5rem}a{color:#8a6420;font-weight:600}@media(prefers-color-scheme:dark){body{color:#f4f4f5;background:#000}a{color:#d9b467}}</style></head><body><h1>Finish in the Briefcase app</h1><p>This page opened outside Briefcase, where you aren’t signed in, so ${name} wasn’t connected.</p><p>Go back to Briefcase on your Home Screen and tap Connect ${name} again.</p><p>If this keeps happening, <a href="/login">sign in here</a> and connect ${name} from The Docket. The connection carries over to the app.</p></body></html>`,
    { status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
