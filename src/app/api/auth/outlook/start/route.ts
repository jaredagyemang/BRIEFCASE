import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OUTLOOK_STATE_COOKIE, outlookAuthorizationUrl } from "@/lib/gmail/outlook";

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
    return NextResponse.redirect(new URL("/docket?outlook=not-configured", origin));
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
