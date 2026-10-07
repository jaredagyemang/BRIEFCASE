import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OUTLOOK_ERROR_COOKIE, OUTLOOK_STATE_COOKIE, errorDetail, outlookAuthorizationUrl } from "@/lib/gmail/outlook";

// "Connect Outlook": sends the coach to Microsoft's sign-in and consent
// screen. As with Gmail, a one-time random value is kept in a private cookie
// and checked when Microsoft sends them back.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const state = randomBytes(32).toString("base64url");
  let url: string;
  try {
    url = outlookAuthorizationUrl(origin, state);
  } catch (error) {
    console.error(error);
    const response = NextResponse.redirect(new URL("/docket?outlook=not-configured", origin));
    // Which setting is missing, for The Docket to show.
    response.cookies.set(OUTLOOK_ERROR_COOKIE, errorDetail(error).slice(0, 600), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/docket",
      maxAge: 120,
    });
    return response;
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(OUTLOOK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/outlook",
    maxAge: 10 * 60,
  });
  return response;
}
