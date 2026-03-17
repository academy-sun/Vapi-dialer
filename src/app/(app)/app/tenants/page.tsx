import { redirect } from "next/navigation";

// /app/tenants → redireciona para /app (shell cuida da seleção)
export default function TenantsPage() {
  redirect("/app");
}
