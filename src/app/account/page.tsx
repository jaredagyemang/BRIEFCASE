import { redirect } from "next/navigation";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaff } from "@/lib/staff";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Account</h1>
      {email && <p className="mt-1 text-muted">Signed in as {email}</p>}

      <div className="mt-6 rounded-3xl bg-surface p-5">
        <AccountForm name={staff.full_name} />
      </div>

      <form action={signOut} className="mt-4">
        <button
          type="submit"
          className="w-full rounded-2xl bg-surface py-3.5 font-semibold text-red"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
