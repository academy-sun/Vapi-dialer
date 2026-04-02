"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import {
  UserPlus, Trash2, Loader2, Check, AlertCircle, X,
  Shield, User, Crown, ChevronDown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  user_id: string;
  email: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error" | "warning";
}

// ─── Toast hook ───────────────────────────────────────────────────────────────

function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  function showToast(message: string, type: ToastItem["type"] = "success") {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  return { toasts, showToast };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(email: string): string {
  const parts = email.split("@")[0].split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return email.substring(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const masked = local.length > 3
    ? local.slice(0, 3) + "***"
    : local[0] + "***";
  return `${masked}@${domain}`;
}

// ─── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: Member["role"] }) {
  const cfg: Record<Member["role"], { label: string; bg: string; color: string; border: string }> = {
    owner: {
      label: "Owner",
      bg: "linear-gradient(135deg, rgba(255,21,55,0.25), rgba(255,80,80,0.15))",
      color: "var(--red)",
      border: "rgba(255,21,55,0.4)",
    },
    admin: {
      label: "Admin",
      bg: "rgba(0,220,255,0.12)",
      color: "var(--cyan)",
      border: "rgba(0,220,255,0.35)",
    },
    member: {
      label: "Membro",
      bg: "var(--glass-bg-2)",
      color: "var(--text-2)",
      border: "var(--glass-border)",
    },
  };
  const { label, bg, color, border } = cfg[role] ?? cfg.member;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 9px",
      borderRadius: "var(--radius-sm)",
      background: bg,
      border: `1px solid ${border}`,
      color,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.04em",
    }}>
      {role === "owner" && <Crown size={10} />}
      {role === "admin" && <Shield size={10} />}
      {role === "member" && <User size={10} />}
      {label}
    </span>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function MemberAvatar({ email, role }: { email: string; role: Member["role"] }) {
  const glowMap: Record<Member["role"], string> = {
    owner:  "0 0 0 2px rgba(255,21,55,0.5), 0 0 16px rgba(255,21,55,0.25)",
    admin:  "0 0 0 2px rgba(0,220,255,0.4)",
    member: "none",
  };

  const bgMap: Record<Member["role"], string> = {
    owner:  "linear-gradient(135deg, var(--red), #ff6b6b)",
    admin:  "linear-gradient(135deg, var(--cyan), #00aaff)",
    member: "var(--glass-bg-2)",
  };

  return (
    <div style={{
      width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
      background: bgMap[role] ?? bgMap.member,
      boxShadow: glowMap[role],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: 800, color: role === "member" ? "var(--text-2)" : "#fff",
      border: `1px solid ${role === "member" ? "var(--glass-border)" : "transparent"}`,
      userSelect: "none",
    }}>
      {getInitials(email)}
    </div>
  );
}

// ─── Toast component ──────────────────────────────────────────────────────────

function ToastNotification({ toast }: { toast: ToastItem }) {
  const icons = {
    success: <Check size={14} style={{ color: "var(--green)", flexShrink: 0 }} />,
    error:   <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0 }} />,
    warning: <AlertCircle size={14} style={{ color: "var(--yellow)", flexShrink: 0 }} />,
  };
  return (
    <div className={`cx-toast cx-toast-${toast.type}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {icons[toast.type]}
      <span style={{ fontSize: 13 }}>{toast.message}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MembersPage() {
  const params = useParams();
  const tenantId = params?.tenantId as string;
  const supabase = createClient();

  const { toasts, showToast } = useToast();

  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserRole, setCurrentUserRole] = useState<string>("member");
  const [loading, setLoading] = useState(true);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "member">("member");
  const [creating, setCreating] = useState(false);

  // Inline editing
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Member["role"]>("member");
  const [savingRole, setSavingRole] = useState(false);

  // Delete tracking
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Current user email (for isSunhubAdmin check)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setCurrentUserEmail(data.user.email);
    });
  }, []);

  // ── Load members ────────────────────────────────────────────────────────────

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMembers(data.members ?? []);
      setCurrentUserRole(data.currentUserRole ?? "member");
    } catch (e) {
      showToast((e as Error).message || "Erro ao carregar membros", "error");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) loadMembers();
  }, [tenantId, loadMembers]);

  // ── Create member ──────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!newEmail.trim() || !newPassword.trim()) {
      showToast("Preencha e-mail e senha.", "warning");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword, role: newRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("Acesso criado com sucesso!", "success");
      setNewEmail("");
      setNewPassword("");
      setNewRole("member");
      setShowCreateForm(false);
      loadMembers();
    } catch (e) {
      showToast((e as Error).message || "Erro ao criar acesso", "error");
    } finally {
      setCreating(false);
    }
  }

  // ── Remove member ──────────────────────────────────────────────────────────

  async function handleRemove(member: Member) {
    if (!confirm(`Remover "${member.email}" desta organização?`)) return;
    setDeletingId(member.user_id);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members?userId=${member.user_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      showToast("Membro removido.", "success");
      loadMembers();
    } catch (e) {
      showToast((e as Error).message || "Erro ao remover membro", "error");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Update role ────────────────────────────────────────────────────────────

  async function handleUpdateRole(userId: string) {
    setSavingRole(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: editingRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("Papel atualizado.", "success");
      setEditingMemberId(null);
      loadMembers();
    } catch (e) {
      showToast((e as Error).message || "Erro ao atualizar papel", "error");
    } finally {
      setSavingRole(false);
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const isSunhubAdmin = currentUserEmail.endsWith("@sunhub.com.br") || currentUserEmail.endsWith("@callx.ai");

  const appUrl = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}/login`
    : "https://app.callx.ai/login";

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 720, margin: "0 auto", width: "100%" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", margin: 0 }}>Membros</h1>
          <p style={{ fontSize: 13, color: "var(--text-3)", margin: "4px 0 0" }}>
            Gerencie quem tem acesso a esta organização
          </p>
        </div>
        {canManage && (
          <button
            className="cx-refresh-btn"
            onClick={() => setShowCreateForm(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <UserPlus size={14} />
            Criar acesso
          </button>
        )}
      </div>

      {/* ── Create Form (slide-down) ── */}
      {showCreateForm && (
        <div
          className="gc"
          style={{
            padding: 20,
            display: "flex", flexDirection: "column", gap: 14,
            animation: "cx-slide-down 0.2s ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)" }}>Novo acesso</span>
            <button
              onClick={() => setShowCreateForm(false)}
              style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer" }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>E-mail *</span>
              <input
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                style={{
                  background: "var(--glass-bg-2)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "9px 12px",
                  color: "var(--text-1)",
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Senha *</span>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Senha de acesso"
                style={{
                  background: "var(--glass-bg-2)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "9px 12px",
                  color: "var(--text-1)",
                  fontSize: 14,
                  outline: "none",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>Papel</span>
            <div style={{ position: "relative", display: "inline-block" }}>
              <select
                className="cx-select"
                value={newRole}
                onChange={e => setNewRole(e.target.value as "admin" | "member")}
                style={{ paddingRight: 32 }}
              >
                <option value="member">Membro</option>
                <option value="admin">Admin</option>
              </select>
              <ChevronDown size={13} style={{
                position: "absolute", right: 10, top: "50%",
                transform: "translateY(-50%)", pointerEvents: "none",
                color: "var(--text-3)",
              }} />
            </div>
          </label>

          {/* Info box */}
          <div style={{
            padding: "10px 14px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(0,220,255,0.07)",
            border: "1px solid rgba(0,220,255,0.25)",
            display: "flex", flexDirection: "column", gap: 4,
          }}>
            <div style={{ fontSize: 11, color: "var(--cyan)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              URL de acesso
            </div>
            <div style={{
              fontSize: 12,
              color: "var(--text-2)",
              fontFamily: "'JetBrains Mono', monospace",
              wordBreak: "break-all",
            }}>
              {appUrl}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-3)" }}>
              Compartilhe este endereço junto com as credenciais acima.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="cx-filter-btn"
              onClick={() => { setShowCreateForm(false); setNewEmail(""); setNewPassword(""); }}
            >
              Cancelar
            </button>
            <button
              className="cx-refresh-btn"
              onClick={handleCreate}
              disabled={creating || !newEmail.trim() || !newPassword.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              {creating ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <UserPlus size={13} />}
              {creating ? "Criando..." : "Criar acesso"}
            </button>
          </div>
        </div>
      )}

      {/* ── Members list ── */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200, gap: 10 }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-3)" }} />
          <span style={{ color: "var(--text-3)", fontSize: 14 }}>Carregando membros...</span>
        </div>
      ) : members.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 14, minHeight: 240, textAlign: "center",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "var(--radius-md)",
            background: "var(--glass-bg-2)", border: "1px solid var(--glass-border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <User size={24} style={{ color: "var(--text-3)" }} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>
              Nenhum membro
            </div>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              Adicione membros para colaborar nesta organização.
            </div>
          </div>
          {canManage && (
            <button className="cx-refresh-btn" onClick={() => setShowCreateForm(true)}
              style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <UserPlus size={14} /> Criar acesso
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map(member => {
            const isCurrentUser = member.email === currentUserEmail;
            const isOwner = member.role === "owner";
            const isEditing = editingMemberId === member.user_id;
            const isDeleting = deletingId === member.user_id;

            // Email masking for sunhub admin visibility
            const displayEmail = !isSunhubAdmin && currentUserRole !== "owner" && member.email.endsWith("@sunhub.com.br")
              ? maskEmail(member.email)
              : member.email;

            return (
              <div
                key={member.id}
                className="gc"
                style={{
                  padding: "14px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  transition: "opacity 0.2s",
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {/* Avatar */}
                <MemberAvatar email={member.email} role={member.role} />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 14, fontWeight: 700, color: "var(--text-1)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {displayEmail}
                    </span>
                    {isCurrentUser && (
                      <span style={{
                        fontSize: 10, padding: "1px 6px",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--glass-bg-2)",
                        border: "1px solid var(--glass-border)",
                        color: "var(--text-3)",
                      }}>
                        você
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                    {isEditing ? (
                      /* Inline role editor */
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ position: "relative" }}>
                          <select
                            className="cx-select"
                            value={editingRole}
                            onChange={e => setEditingRole(e.target.value as Member["role"])}
                            style={{ fontSize: 12, padding: "3px 24px 3px 8px" }}
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Membro</option>
                            {currentUserRole === "owner" && <option value="owner">Owner</option>}
                          </select>
                          <ChevronDown size={11} style={{
                            position: "absolute", right: 6, top: "50%",
                            transform: "translateY(-50%)", pointerEvents: "none",
                            color: "var(--text-3)",
                          }} />
                        </div>
                        <button
                          onClick={() => handleUpdateRole(member.user_id)}
                          disabled={savingRole}
                          style={{
                            background: "var(--green)",
                            border: "none",
                            borderRadius: "var(--radius-sm)",
                            padding: "4px 8px",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex", alignItems: "center",
                          }}
                        >
                          {savingRole
                            ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                            : <Check size={12} />}
                        </button>
                        <button
                          onClick={() => setEditingMemberId(null)}
                          style={{
                            background: "var(--glass-bg-2)",
                            border: "1px solid var(--glass-border)",
                            borderRadius: "var(--radius-sm)",
                            padding: "4px 8px",
                            color: "var(--text-2)",
                            cursor: "pointer",
                            display: "flex", alignItems: "center",
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                    <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                      desde {formatDate(member.created_at)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {canManage && !isOwner && !isCurrentUser && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {/* Edit role button */}
                    {!isEditing && (
                      <button
                        onClick={() => { setEditingMemberId(member.user_id); setEditingRole(member.role); }}
                        title="Editar papel"
                        style={{
                          background: "var(--glass-bg-2)",
                          border: "1px solid var(--glass-border)",
                          borderRadius: "var(--radius-sm)",
                          padding: "6px 10px",
                          color: "var(--text-2)",
                          cursor: "pointer",
                          fontSize: 12,
                          display: "flex", alignItems: "center", gap: 4,
                          transition: "border-color 0.15s, color 0.15s",
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--cyan)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--cyan)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--glass-border)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-2)";
                        }}
                      >
                        <Shield size={12} />
                        <span>Papel</span>
                      </button>
                    )}

                    {/* Delete button */}
                    <button
                      onClick={() => handleRemove(member)}
                      disabled={isDeleting}
                      title="Remover membro"
                      style={{
                        background: "var(--glass-bg-2)",
                        border: "1px solid var(--glass-border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "6px 8px",
                        color: "var(--text-3)",
                        cursor: isDeleting ? "not-allowed" : "pointer",
                        display: "flex", alignItems: "center",
                        transition: "border-color 0.15s, color 0.15s",
                      }}
                      onMouseEnter={e => {
                        if (!isDeleting) {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,21,55,0.5)";
                          (e.currentTarget as HTMLButtonElement).style.color = "var(--red)";
                        }
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--glass-border)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-3)";
                      }}
                    >
                      {isDeleting
                        ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                        : <Trash2 size={14} />}
                    </button>
                  </div>
                )}

                {/* Owner crown indicator (non-actionable) */}
                {isOwner && (
                  <Crown size={16} style={{ color: "var(--red)", flexShrink: 0, opacity: 0.7 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Toasts ── */}
      <div className="cx-toast-container">
        {toasts.map(t => <ToastNotification key={t.id} toast={t} />)}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes cx-slide-down {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
