import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin-helper";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/app");

  return <>{children}</>;
}
