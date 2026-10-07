import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ONBOARDED_COOKIE, onboardedMark, onboardingStep, safeNext, welcomePath } from "@/lib/onboarding";

// Refreshes the Supabase session cookie on every request, sends signed-out
// visitors to /login (except to the password reset screens), and sends
// coaches who haven't finished first use (the terms, then the tutorial) there
// first.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Don't put code between createServerClient and getClaims: getClaims is
  // what refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const onLogin = request.nextUrl.pathname.startsWith("/login");
  // Password reset works signed in or out: using the emailed link signs the
  // coach in before the new password is saved.
  const onPasswordReset = ["/forgot-password", "/reset-password"].some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  // A school's IT administrator returning from Microsoft's "approve for your
  // organization" screen (they may not have a Briefcase login).
  const adminConsent =
    request.nextUrl.pathname === "/api/auth/outlook/callback" && request.nextUrl.searchParams.has("admin_consent");
  if (adminConsent) return response;

  // Connect Gmail / Outlook answer signed-out visits themselves, with how to
  // finish in the app (see lib/mail/connect-window.ts), rather than a sign-in
  // page in the wrong place.
  const onMailConnect = /^\/api\/auth\/(gmail|outlook)\/(start|callback)$/.test(request.nextUrl.pathname);

  if (!signedIn && !onLogin && !onPasswordReset && !onMailConnect) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (signedIn && onLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/events";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // First use: the Privacy Policy and Terms of Use, then the tutorial.
  const onWelcome = request.nextUrl.pathname.startsWith("/welcome");
  if (signedIn && !onWelcome && !onPasswordReset) {
    const userId = String(data!.claims.sub);
    if (request.cookies.get(ONBOARDED_COOKIE)?.value !== onboardedMark(userId)) {
      let step;
      try {
        step = await onboardingStep(supabase, userId);
      } catch (error) {
        console.error("Checking first use failed", error);
        step = "terms" as const;
      }
      if (step !== "done") {
        const url = request.nextUrl.clone();
        const next = safeNext(request.nextUrl.pathname + request.nextUrl.search);
        const target = new URL(welcomePath(step, next), url);
        return NextResponse.redirect(target);
      }
      response.cookies.set(ONBOARDED_COOKIE, onboardedMark(userId), {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  return response;
}
