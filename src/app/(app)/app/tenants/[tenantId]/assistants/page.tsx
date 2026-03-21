import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AssistantsClient from "./AssistantsClient";

export default async function AssistantsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <AssistantsClient />;
}
