import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import VapiConnectionClient from "./VapiConnectionClient";

type Params = { params: Promise<{ tenantId: string }> };

export default async function VapiPage({ params }: Params) {
  const { tenantId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", user.id)
    .single();

  // Só redireciona se explicitamente for member — se a query falhar por timing
  // de cookie (troca de tenant), deixa passar; as API routes bloqueiam se necessário
  if (!error && membership?.role === "member") {
    redirect(`/app/tenants/${tenantId}/queues`);
  }

  return <VapiConnectionClient />;
}
