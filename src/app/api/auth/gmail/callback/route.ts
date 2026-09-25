import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { saveConnection } from "@/lib/gmail/connection";
import { GMAIL_READONLY, STATE_COOKIE, emailFromIdToken, exchangeCode, revokeToken } from "@/lib/gmail/google";

// Google sends the coach back here after the consent screen. The result is
// reported on The Docket via ?gmail=…
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/docket?gmail=${result}`, origin));
    response.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/gmail" });
    return response;
  };

  // The one-time value from "Connect Gmail" must come back unchanged.
  const expected = request.cookies.get(STATE_COOKIE)?.value ?? "";
  const received = searchParams.get("state") ?? "";
  const stateOk =
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!stateOk) return back("failed");

  // "Cancel" on Google's screen.
  if (searchParams.get("error")) return back(searchParams.get("error") === "access_denied" ? "denied" : "failed");

  const code = searchParams.get("code");
  if (!code) return back("failed");

  try {
    const tokens = await exchangeCode(code, origin);
    // Google's consent screen lets people untick individual permissions.
    if (!tokens.scope.split(" ").includes(GMAIL_READONLY)) {
      await revokeToken(tokens.refresh_token ?? tokens.access_token);
      return back("missing-permission");
    }
    const googleEmail = emailFromIdToken(tokens.id_token);
    if (!tokens.refresh_token || !googleEmail) {
      console.error("Google didn't return a refresh token or email", { refresh: Boolean(tokens.refresh_token), email: Boolean(googleEmail) });
      return back("failed");
    }
    await saveConnection({
      googleEmail,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope,
    });
    return back("connected");
  } catch (error) {
    console.error("Connecting Gmail failed", error);
    return back("failed");
  }
}
