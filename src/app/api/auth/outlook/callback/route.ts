import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { saveConnection } from "@/lib/gmail/connection";
import { OUTLOOK_STATE_COOKIE, exchangeOutlookCode, outlookAddress, outlookCanRead } from "@/lib/gmail/outlook";

// Microsoft sends the coach back here after its sign-in and consent screen.
// The result is reported on The Docket via ?outlook=…
//
// Microsoft also sends a school's IT administrator here after they approve
// Briefcase for the whole school (?admin_consent=True). They may not use
// Briefcase themselves, so that case is answered here directly.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  if (searchParams.has("admin_consent")) return approvedPage(searchParams.get("admin_consent") === "True");

  const back = (result: string) => {
    const response = NextResponse.redirect(new URL(`/docket?outlook=${result}`, origin));
    response.cookies.delete({ name: OUTLOOK_STATE_COOKIE, path: "/api/auth/outlook" });
    return response;
  };

  // The one-time value from "Connect Outlook" must come back unchanged.
  const expected = request.cookies.get(OUTLOOK_STATE_COOKIE)?.value ?? "";
  const received = searchParams.get("state") ?? "";
  const stateOk =
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!stateOk) return back("failed");

  const error = searchParams.get("error");
  if (error) {
    const detail = searchParams.get("error_description") ?? "";
    console.error("Outlook sign-in returned an error", error, detail.split("\n")[0]);
    // The school only lets administrators approve apps that read mail.
    if (/AADSTS(65001|90094|90095|90099)/.test(detail) || error === "consent_required") return back("admin-approval");
    // The school's security rules (Conditional Access) blocked the sign-in.
    if (/AADSTS(53003|53000|53001|50105|530032)/.test(detail)) return back("blocked");
    // "Cancel" or "No" on Microsoft's screen.
    if (error === "access_denied") return back("denied");
    return back("failed");
  }

  const code = searchParams.get("code");
  if (!code) return back("failed");

  try {
    const tokens = await exchangeOutlookCode(code, origin);
    if (!outlookCanRead(tokens.scope)) return back("missing-permission");
    const address = await outlookAddress(tokens.access_token);
    if (!tokens.refresh_token || !address) {
      console.error("Microsoft didn't return a refresh token or address", {
        refresh: Boolean(tokens.refresh_token),
        address: Boolean(address),
      });
      return back("failed");
    }
    await saveConnection({
      provider: "microsoft",
      googleEmail: address,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      scopes: tokens.scope,
    });
    return back("connected");
  } catch (error) {
    console.error("Connecting Outlook failed", error);
    return back("failed");
  }
}

// Shown to an IT administrator after Microsoft's "approve for your
// organization" screen.
function approvedPage(approved: boolean) {
  const message = approved
    ? "Briefcase is approved for your organization. Coaches can now connect Outlook from The Docket or their Profile."
    : "Briefcase wasn’t approved. Nothing was changed.";
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Briefcase</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;line-height:1.5;color:#111114;background:#f5f5f7}h1{font-size:1.5rem}</style></head><body><h1>${approved ? "Approved" : "Not approved"}</h1><p>${message}</p></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
