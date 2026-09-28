import { ResetCallback } from "@/components/reset-callback";

export const metadata = { title: "Set a new password · Briefcase" };

// Where the reset email's link lands (the redirectTo given to Supabase).
export default function ResetCallbackPage() {
  return <ResetCallback />;
}
