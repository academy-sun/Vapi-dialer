"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { UserPlus, Trash2, Loader2, Check, AlertCircle, X, Shield, User } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

interface Member {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

interface ToastMsg { id: string; message: string; type: "success" | "error" }

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const show = useCallback((message: string, type: ToastMsg["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, message, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

export default function MembersPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string>("");
  const { toasts, show: showToast } = useToast();

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/members`);
    const data = await res.json();
    setMembers(data.members ?? []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    loadMembers();
  }, [loadMembers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    const res = await fetch(`/api/tenants/${tenantId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error ?? "Erro ao criar acesso");
      setSaving(false);
      return;
    }
    showToast(`Acesso criado para ${email}`);
    setEmail("");
    setPassword("");
    setRole("member");
    setShowForm(false);
    loadMembers();
    setSaving(false);
  }

  async function handleRemove(member: Member) {
    if (!confirm(`Remover acesso de ${member.email}?`)) return;
    const res = await fetch(`/api/tenants/${tenantId}/members?userId=${member.user_id}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Erro ao remover", "error");
      return;
    }
    showToast(`Acesso de ${member.email} removido`);
    loadMembers();
  }

  async function handleUpdateRole(member: Member, newRole: string) {
    const res = await fetch(`/api/tenants/${tenantId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: member.user_id, role: newRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error ?? "Erro ao atualizar", "error");
      return;
    }
    showToast("Role atualizado");
    setEditingMemberId(null);
    loadMembers();
  }

  // Role do usuário logado neste tenant
  const currentMember = members.find(m => m.user_id === currentUserId);
  const canManage = !loading && (currentMember?.role === "owner" || currentMember?.role === "admin");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Membros</h1>
          <p className="page-subtitle">Gerencie quem tem acesso a este tenant</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <UserPlus className="w-4 h-4" />
            Criar acesso
          </button>
        )}
      </div>

      {/* Formulário de criação — só para owner/admin */}
      {canManage && showForm && (
        <div className="card mb-6">
          <div className="card-header flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Novo acesso</h2>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="btn-icon text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <form onSubmit={handleCreate} className="card-body space-y-4">
            {formError && (
              <div className="alert-error">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{formError}</span>
              </div>
            )}
            <div>
              <label className="form-label">Email do cliente</label>
              <input
                type="email"
                className="form-input"
                placeholder="cliente@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="form-label">Senha</label>
              <input
                type="text"
                className="form-input font-mono"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <p className="text-xs text-gray-400 mt-1">
                Anote a senha — você precisará enviá-la manualmente para o cliente.
              </p>
            </div>
            <div>
              <label className="form-label">Nível de acesso</label>
              <select className="select-native" value={role} onChange={e => setRole(e.target.value)}>
                <option value="member">Member — acesso ao tenant (sem configurações admin)</option>
                <option value="admin">Admin — acesso completo exceto owner</option>
              </select>
            </div>
            <div className="alert-info text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: "#FF1A1A" }} />
              <div>
                <p className="font-semibold">Como compartilhar o acesso:</p>
                <p className="mt-0.5 text-gray-700">
                  Envie para o cliente:<br />
                  URL: <strong>{typeof window !== "undefined" ? window.location.origin : ""}/login</strong><br />
                  Email: <strong>{email || "o email cadastrado"}</strong><br />
                  Senha: <strong>{password || "a senha definida acima"}</strong>
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { setShowForm(false); setFormError(""); }} className="btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Criando...</> : <><Check className="w-4 h-4" />Criar acesso</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de membros */}
      {loading ? (
        <div className="card p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : members.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><User className="w-full h-full text-gray-200" /></div>
            <p className="empty-state-title">Nenhum membro ainda</p>
            <p className="empty-state-desc">Crie o primeiro acesso para um cliente.</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nível</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const isSunhubAdmin = m.email === "academysunhub@gmail.com";
                const displayEmail = (!canManage && isSunhubAdmin) ? "aceleradoramx3@mx3.com" : m.email;
                return (
                <tr key={m.id}>
                  <td className="font-medium text-gray-900">{displayEmail}</td>

                  {/* Célula de role — clicável para editar apenas se owner/admin */}
                  <td>
                    {canManage && editingMemberId === m.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="select-native text-xs py-1"
                          value={editingRole}
                          onChange={e => setEditingRole(e.target.value)}
                          autoFocus
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => handleUpdateRole(m, editingRole)}
                          className="btn-primary btn-sm px-2 py-1"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingMemberId(null)}
                          className="btn-secondary btn-sm px-2 py-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (canManage && m.role !== "owner") {
                            setEditingMemberId(m.id);
                            setEditingRole(m.role);
                          }
                        }}
                        title={canManage && m.role !== "owner" ? "Clique para editar" : ""}
                        style={{ cursor: canManage && m.role !== "owner" ? "pointer" : "default", background: "none", border: "none", padding: 0 }}
                      >
                        {m.role === "owner" && <span className="badge badge-purple"><Shield className="w-3 h-3 inline mr-1" />Owner</span>}
                        {m.role === "admin" && <span className="badge badge-indigo"><Shield className="w-3 h-3 inline mr-1" />Admin</span>}
                        {m.role === "member" && <span className="badge badge-gray"><User className="w-3 h-3 inline mr-1" />Member</span>}
                      </button>
                    )}
                  </td>

                  <td className="text-gray-500 text-sm">
                    {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </td>

                  {/* Botão de excluir — só para owner/admin, e não para si mesmo nem para owner */}
                  <td>
                    {canManage && m.user_id !== currentUserId && m.role !== "owner" && (
                      <button
                        onClick={() => handleRemove(m)}
                        className="btn-icon text-gray-400 hover:text-red-500"
                        title="Remover acesso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success" ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
