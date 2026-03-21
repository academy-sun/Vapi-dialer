import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Buscar primeiro tenant do usuário e redirecionar diretamente
  const { data } = await supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (data) {
    redirect(`/app/tenants/${data.tenant_id}/queues`);
  }

  // Fallback: sem tenant associado
  return (
    <div className="flex items-center justify-center h-full text-gray-400">
      <div className="text-center">
        <p className="text-base font-medium text-gray-600 mb-2">Nenhum tenant encontrado</p>
        <p className="text-sm text-gray-400">Crie um tenant na barra lateral para começar.</p>
      </div>
    </div>
  );
}
