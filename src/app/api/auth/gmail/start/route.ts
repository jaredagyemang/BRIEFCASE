import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { STATE_COOKIE, authorizationUrl } from "@/lib/gmail/google";
import { handoffPage, isSignedIn, rememberWindow } from "@/lib/mail/connect-window";

// "Connect Gmail": sends the coach to Google's sign-in and consent screen.
// A one-time random value is kept in a private cookie and checked when Google
// sends them back, so nobody else can complete (or forge) the connection.
// Signed out (e.g. Safari, when Briefcase is installed on an iPhone or iPad
// Home Screen): say how to finish instead of starting.
export async function GET(request: NextRequest) {
  if (!(await isSignedIn())) return handoffPage("gmail");
  const origin = request.nextUrl.origin;
  const state = randomBytes(32).toString("base64url");
  let url: string;
  try {
    url = authorizationUrl(origin, state);
  } catch (error) {
    console.error(error);
    return NextResponse.redirect(new URL("/docket?gmail=not-configured", origin));
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/gmail",
    maxAge: 10 * 60,
  });
  rememberWindow(request, response, "gmail");
  return response;
}
