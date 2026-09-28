import { AuthScreen } from "@/components/auth-screen";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Reset your password · Briefcase" };

export default function ForgotPasswordPage() {
  return (
    <AuthScreen title="Forgot your password?" subtitle="Enter your email and we’ll send you a link to set a new one.">
      <ForgotPasswordForm />
    </AuthScreen>
  );
}
