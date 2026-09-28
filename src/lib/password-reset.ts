// Shared by the password reset action, page and link callback.

// Set once this browser has used a reset link (which signs the coach in),
// holding their user id. It lets the new password be saved without the link
// again, since a link only works once.
export const VERIFIED_COOKIE = "briefcase-reset-verified";

export const VERIFIED_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/reset-password",
  // Time to type and save the new password after opening the link.
  maxAge: 15 * 60,
};

// Why a reset link couldn't be used, shown on the expired screen.
export type ResetProblem = "expired";
