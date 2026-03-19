import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin-helper";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const isAdmin = isAdminEmail(user.email);

  return <AppShell user={user} isAdmin={isAdmin}>{children}</AppShell>;
}
