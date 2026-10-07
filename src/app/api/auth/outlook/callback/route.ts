import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { saveConnection } from "@/lib/gmail/connection";
import {
  OUTLOOK_ERROR_COOKIE,
  OUTLOOK_STATE_COOKIE,
  errorDetail,
  exchangeOutlookCode,
  outlookAddress,
  outlookCanRead,
} from "@/lib/gmail/outlook";
import { handoffPage, isSignedIn, resultRedirect } from "@/lib/mail/connect-window";

// Microsoft sends the coach back here after its sign-in and consent screen.
// The result is reported on The Docket via ?outlook=…
//
// Microsoft also sends a school's IT administrator here after they approve
// Briefcase for the whole school (?admin_consent=True). They may not use
// Briefcase themselves, so that case is answered here directly.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  if (searchParams.has("admin_consent")) return approvedPage(searchParams.get("admin_consent") === "True");
  // Back somewhere without the coach's sign-in (see handoffPage).
  if (!(await isSignedIn())) return handoffPage("outlook");

  // `reason`: exactly what went wrong, shown on The Docket (and logged).
  const back = (result: string, reason?: string) => {
    const response = resultRedirect(request, "outlook", result);
    response.cookies.delete({ name: OUTLOOK_STATE_COOKIE, path: "/api/auth/outlook" });
    if (reason) {
      console.error(`Connecting Outlook: ${result}:`, reason);
      response.cookies.set(OUTLOOK_ERROR_COOKIE, reason.slice(0, 600), {
        httpOnly: true,
        secure: request.nextUrl.protocol === "https:",
        sameSite: "lax",
        path: "/docket",
        maxAge: 120,
      });
    } else {
      response.cookies.delete({ name: OUTLOOK_ERROR_COOKIE, path: "/docket" });
    }
    return response;
  };

  // The one-time value from "Connect Outlook" must come back unchanged.
  const expected = request.cookies.get(OUTLOOK_STATE_COOKIE)?.value ?? "";
  const received = searchParams.get("state") ?? "";
  const stateOk =
    expected.length > 0 &&
    expected.length === received.length &&
    timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  if (!stateOk) {
    return back(
      "failed",
      expected
        ? "The sign-in check didn’t match (state mismatch). Start again from Connect Outlook in this same browser tab."
        : "The sign-in check cookie was missing (state cookie). It lasts 10 minutes and only works on the web address you started from (e.g. not localhost in one place and 127.0.0.1 in another). Start again from Connect Outlook.",
    );
  }

  const error = searchParams.get("error");
  if (error) {
    const detail = searchParams.get("error_description") ?? "";
    const reason = `Microsoft returned: ${error}${detail ? ` — ${detail.split(/\r?\n/)[0]}` : ""}`;
    // The school only lets administrators approve apps that read mail.
    if (/AADSTS(65001|90094|90095|90099)/.test(detail) || error === "consent_required") {
      return back("admin-approval", reason);
    }
    // The school's security rules (Conditional Access) blocked the sign-in.
    if (/AADSTS(53003|53000|53001|50105|530032)/.test(detail)) return back("blocked", reason);
    // "Cancel" or "No" on Microsoft's screen.
    if (error === "access_denied") return back("denied", reason);
    return back("failed", reason);
  }

  const code = searchParams.get("code");
  if (!code) return back("failed", "Microsoft sent the coach back without a sign-in code or an error.");

  try {
    const tokens = await exchangeOutlookCode(code, origin);
    if (!outlookCanRead(tokens.scope)) {
      return back("missing-permission", `Microsoft granted only these permissions: ${tokens.scope || "(none)"}`);
    }
    if (!tokens.refresh_token) {
      return back(
        "failed",
        `Microsoft didn’t return a refresh token (is offline_access added under API permissions in Entra?). Granted: ${tokens.scope}`,
      );
    }
    const address = await outlookAddress(tokens.access_token);
    if (!address) {
      return back(
        "failed",
        "Microsoft didn’t return an email address for this account (Graph /me has no mail or userPrincipalName).",
      );
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
    return back("failed", errorDetail(error));
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
