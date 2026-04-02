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
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
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
    if (data.currentUserRole) setCurrentUserRole(data.currentUserRole);
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

  // Role efetivo: vem da API (inclui admins globais sem membership row)
  // Fallback: buscar no array de membros pelo userId atual (para membros regulares)
  const currentMember = members.find(m => m.user_id === currentUserId);
  const effectiveRole = currentUserRole ?? currentMember?.role ?? null;
  const canManage = !loading && (effectiveRole === "owner" || effectiveRole === "admin");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Membros</h1>
          <p className="page-subtitle">Gerencie quem tem acesso a este tenant</p>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">
            <UserPlus style={{ width: 16, height: 16 }} />
            Criar acesso
          </button>
        )}
      </div>

      {/* Formulario de criacao -- so para owner/admin */}
      {canManage && showForm && (
        <div className="gc" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>Novo acesso</h2>
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="btn-icon">
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
          <form onSubmit={handleCreate} className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {formError && (
              <div className="alert-error">
                <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: 13 }}>{formError}</span>
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
                className="form-input mono"
                placeholder="Minimo 6 caracteres"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Anote a senha — voce precisara envia-la manualmente para o cliente.
              </p>
            </div>
            <div>
              <label className="form-label">Nivel de acesso</label>
              <select className="cx-select" style={{ width: '100%' }} value={role} onChange={e => setRole(e.target.value)}>
                <option value="member">Member — acesso ao tenant (sem configuracoes admin)</option>
                <option value="admin">Admin — acesso completo exceto owner</option>
              </select>
            </div>
            <div className="alert-warning" style={{ fontSize: 13 }}>
              <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, color: 'var(--red)' }} />
              <div>
                <p style={{ fontWeight: 600 }}>Como compartilhar o acesso:</p>
                <p style={{ marginTop: 2, color: 'var(--text-2)' }}>
                  Envie para o cliente:<br />
                  URL: <strong>{typeof window !== "undefined" ? window.location.origin : ""}/login</strong><br />
                  Email: <strong>{email || "o email cadastrado"}</strong><br />
                  Senha: <strong>{password || "a senha definida acima"}</strong>
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--glass-border)' }}>
              <button type="button" onClick={() => { setShowForm(false); setFormError(""); }} className="btn btn-secondary">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary">
                {saving ? <><Loader2 style={{ width: 16, height: 16, animation: 'cx-spin .8s linear infinite' }} />Criando...</> : <><Check style={{ width: 16, height: 16 }} />Criar acesso</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lista de membros */}
      {loading ? (
        <div className="gc" style={{ padding: 32 }}>
          <div className="cx-loading">
            <div className="cx-spinner" />
          </div>
        </div>
      ) : members.length === 0 ? (
        <div className="gc">
          <div className="empty-state">
            <div className="empty-state-icon"><User style={{ width: '100%', height: '100%', color: 'var(--text-3)' }} /></div>
            <p className="empty-state-title">Nenhum membro ainda</p>
            <p className="empty-state-desc">Crie o primeiro acesso para um cliente.</p>
          </div>
        </div>
      ) : (
        <div className="gc" style={{ overflow: 'hidden' }}>
          <table className="cx-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nivel</th>
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
                  <td style={{ fontWeight: 500, color: 'var(--text-1)' }}>{displayEmail}</td>

                  {/* Celula de role -- clicavel para editar apenas se owner/admin */}
                  <td>
                    {canManage && editingMemberId === m.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <select
                          className="cx-select"
                          style={{ fontSize: 12, padding: '4px 8px' }}
                          value={editingRole}
                          onChange={e => setEditingRole(e.target.value)}
                          autoFocus
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button
                          onClick={() => handleUpdateRole(m, editingRole)}
                          className="btn btn-primary btn-sm"
                          style={{ padding: '4px 8px' }}
                        >
                          <Check style={{ width: 12, height: 12 }} />
                        </button>
                        <button
                          onClick={() => setEditingMemberId(null)}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '4px 8px' }}
                        >
                          <X style={{ width: 12, height: 12 }} />
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
                        {m.role === "owner" && <span className="badge badge-red"><Shield style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />Owner</span>}
                        {m.role === "admin" && <span className="badge badge-blue"><Shield style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />Admin</span>}
                        {m.role === "member" && <span className="badge badge-gray"><User style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />Member</span>}
                      </button>
                    )}
                  </td>

                  <td style={{ color: 'var(--text-3)', fontSize: 13 }}>
                    {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </td>

                  {/* Botao de excluir -- so para owner/admin, e nao para si mesmo nem para owner */}
                  <td>
                    {canManage && m.user_id !== currentUserId && m.role !== "owner" && (
                      <button
                        onClick={() => handleRemove(m)}
                        className="btn-icon"
                        title="Remover acesso"
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
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
      <div className="cx-toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`cx-toast ${t.type === "success" ? "cx-toast-success" : "cx-toast-error"}`}>
            {t.type === "success" ? <Check style={{ width: 16, height: 16, color: 'var(--green)' }} /> : <AlertCircle style={{ width: 16, height: 16 }} />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
