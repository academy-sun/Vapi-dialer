"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import {
  Zap,
  Settings2,
  Users,
  ListOrdered,
  PhoneCall,
  UserCheck,
  LogOut,
  Plus,
  ChevronDown,
  Building2,
  Check,
  X,
  FlaskConical,
  LayoutDashboard,
  BarChart2,
  Bot,
  Bell,
  AlertTriangle,
  Search,
  FileBarChart2,
} from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  timezone: string;
}

interface ToastItem {
  id: string;
  message: string;
  type: "success" | "error";
}

export default function AppShell({
  user,
  isAdmin = false,
  children,
}: {
  user: User;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantRoles, setTenantRoles] = useState<Record<string, string>>({});
  const [activeTenantId, setActiveTenantId] = useState<string>("");
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // ── Bell de notificações de minutos ──
  const [minutesStatus, setMinutesStatus] = useState<{
    contracted: number | null;
    usedSeconds: number;
    blocked: boolean;
    month: string | null;
  } | null>(null);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [bellDismissed, setBellDismissed] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    loadTenants();
  }, []);

  // Fetch minutes status when active tenant changes
  useEffect(() => {
    if (!activeTenantId) return;
    fetch(`/api/tenants/${activeTenantId}/vapi-connection`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const conn = d?.connection;
        if (!conn || conn.contracted_minutes == null) {
          setMinutesStatus(null);
          return;
        }
        setMinutesStatus({
          contracted:   conn.contracted_minutes,
          usedSeconds:  conn.minutes_used_cache ?? 0,
          blocked:      conn.minutes_blocked ?? false,
          month:        conn.minutes_cache_month ?? null,
        });
        // Check if dismissed for this tenant+month combo
        const month = conn.minutes_cache_month ?? new Date().toISOString().slice(0, 7);
        const dismissKey = `callx_notif_dismissed_${activeTenantId}_${month}`;
        setBellDismissed(localStorage.getItem(dismissKey) === "true");
      })
      .catch(() => setMinutesStatus(null));
  }, [activeTenantId]);

  // Close bell dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setShowBellDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTenantDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync activeTenantId com o tenantId presente na URL — cobre bug #1 e #3:
  // quando o layout persiste e o pathname muda (back/forward, link direto),
  // o dropdown e a navbar atualizam para o tenant correto.
  useEffect(() => {
    if (!rolesLoaded || tenants.length === 0) return;
    const match = pathname.match(/\/app\/tenants\/([^/]+)/);
    if (!match) return;
    const urlTenantId = match[1];
    if (urlTenantId !== activeTenantId && tenants.find((t) => t.id === urlTenantId)) {
      setActiveTenantId(urlTenantId);
      localStorage.setItem("activeTenantId", urlTenantId);
    }
  }, [pathname, rolesLoaded, tenants]);

  async function loadTenants() {
    const res = await fetch("/api/tenants");
    const data = await res.json();
    if (data.tenants) {
      const sorted = [...data.tenants].sort((a: Tenant, b: Tenant) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
      );
      setTenants(sorted);

      // 1. Popular roles ANTES de definir o tenant ativo — elimina race condition
      const roles: Record<string, string> = {};
      sorted.forEach((t: Tenant & { role?: string }) => {
        if (t.id && t.role) roles[t.id] = t.role;
      });
      setTenantRoles(roles);

      // 2. Só depois definir o tenant ativo, validando contra a lista real
      const saved = localStorage.getItem("activeTenantId");
      const validId = (saved && sorted.find((t: Tenant) => t.id === saved))
        ? saved
        : sorted[0]?.id;
      if (validId) {
        setActiveTenantId(validId);
        localStorage.setItem("activeTenantId", validId);
      }

      // 3. Sinalizar que roles + tenant ativo estão prontos para renderizar o menu
      setRolesLoaded(true);
    }
  }

  function selectTenant(id: string, navigate = false, rolesSnapshot?: Record<string, string>) {
    setActiveTenantId(id);
    localStorage.setItem("activeTenantId", id);
    setShowTenantDropdown(false);
    setTenantSearch("");
    if (navigate) {
      // Usar snapshot passado ou tenantRoles atual — evita ler state stale
      const resolvedRoles = rolesSnapshot ?? tenantRoles;
      const role = resolvedRoles[id] ?? "member";
      const canAccessAll = isAdmin || role === "owner" || role === "admin";

      // Preservar a seção atual (ex: /queues, /leads, /calls…) ao trocar de tenant
      const knownSections = ["queues", "leads", "calls", "assistants", "analytics", "members", "vapi"];
      // Normalizar sub-rotas de analytics para "analytics" ao trocar de tenant
      const normalizeSection = (s: string) => s === "dossie" ? "analytics" : s;
      const sectionMatch = pathname.match(/\/app\/tenants\/[^/]+\/([^/]+)/);
      const rawSection = sectionMatch?.[1] ?? null;
      const currentSection = rawSection ? normalizeSection(rawSection) : null;
      const keepSection = currentSection && knownSections.includes(currentSection)
        // Garante que member não caia em seção restrita ao trocar de tenant
        && (canAccessAll || !["vapi", "assistants", "analytics", "members"].includes(currentSection))
        ? currentSection
        : null;

      const destination = keepSection
        ? `/app/tenants/${id}/${keepSection}`
        : canAccessAll
          ? `/app/tenants/${id}/vapi`
          : `/app/tenants/${id}/queues`;

      router.push(destination);
    }
  }

  function showToast(message: string, type: "success" | "error" = "success") {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }

  async function createTenant() {
    if (!newTenantName.trim()) return;
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTenantName }),
    });
    const data = await res.json();
    if (data.tenant) {
      // Novo tenant sempre tem role "owner" para quem criou
      const newRoles = { ...tenantRoles, [data.tenant.id]: "owner" };
      setTenantRoles(newRoles);
      setTenants((prev) =>
        [...prev, data.tenant].sort((a: Tenant, b: Tenant) =>
          a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
        )
      );
      selectTenant(data.tenant.id, false, newRoles);
      setNewTenantName("");
      setShowCreateTenant(false);
      showToast(`Organização "${data.tenant.name}" criada com sucesso!`);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleRequestMinutes() {
    if (!activeTenantId) return;
    setSendingEmail(true);
    const res = await fetch(`/api/tenants/${activeTenantId}/request-minutes`, { method: "POST" });
    if (res.ok) {
      showToast("Solicitação enviada! Entraremos em contato em breve.");
      setShowBellDropdown(false);
    } else {
      showToast("Erro ao enviar solicitação. Tente novamente.", "error");
    }
    setSendingEmail(false);
  }

  function dismissBellNotification() {
    if (!minutesStatus?.month || !activeTenantId) return;
    const dismissKey = `callx_notif_dismissed_${activeTenantId}_${minutesStatus.month}`;
    localStorage.setItem(dismissKey, "true");
    setBellDismissed(true);
    setShowBellDropdown(false);
  }

  // Bell notification derived state
  const usedMinutes = minutesStatus ? Math.ceil(minutesStatus.usedSeconds / 60) : 0;
  const minutesPct  = minutesStatus?.contracted ? Math.round((usedMinutes / minutesStatus.contracted) * 100) : 0;
  const showBellBadge = minutesStatus != null && minutesPct >= 80 && (!bellDismissed || minutesStatus.blocked);

  const activeTenant = tenants.find((t) => t.id === activeTenantId);

  const activeRole = tenantRoles[activeTenantId] ?? "member";
  // isAdmin (global) sempre tem acesso de owner; role por tenant como fallback
  const isAdminOrOwner = rolesLoaded && (isAdmin || activeRole === "owner" || activeRole === "admin");

  // navItems só é populado após roles estarem prontos — evita renderizar menu incompleto
  const navItems = (activeTenantId && rolesLoaded)
    ? [
        {
          label: "Relatórios",
          href: `/app/tenants/${activeTenantId}/analytics`,
          icon: BarChart2,
        },
        {
          label: "Lista de Leads",
          href: `/app/tenants/${activeTenantId}/leads`,
          icon: Users,
        },
        {
          label: "Campanhas",
          href: `/app/tenants/${activeTenantId}/queues`,
          icon: ListOrdered,
        },
        {
          label: "Chamadas",
          href: `/app/tenants/${activeTenantId}/calls`,
          icon: PhoneCall,
        },
        {
          label: "Assistentes",
          href: `/app/tenants/${activeTenantId}/assistants`,
          icon: Bot,
        },
        {
          label: "Membros",
          href: `/app/tenants/${activeTenantId}/members`,
          icon: UserCheck,
        },
        ...(isAdminOrOwner ? [
          {
            label: "Dossiê Comercial",
            href: `/app/tenants/${activeTenantId}/analytics/dossie`,
            icon: FileBarChart2,
          },
          {
            label: "Configurações",
            href: `/app/tenants/${activeTenantId}/vapi`,
            icon: Settings2,
          },
        ] : []),
      ]
    : [];

  const userInitials = user.email
    ? user.email.substring(0, 2).toUpperCase()
    : "??";

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ── Sidebar ── */}
      <aside className="sidebar z-30">

        {/* Logo */}
        <div className="sidebar-logo">
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "18px",
              fontWeight: 700,
              color: "#FFFFFF",
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}>
              CALL
            </span>
            <span style={{
              fontFamily: "Inter, sans-serif",
              fontSize: "22px",
              fontWeight: 700,
              color: "#FF1A1A",
              letterSpacing: "-0.5px",
              lineHeight: 1,
            }}>
              X
            </span>
          </div>
          <div style={{
            fontSize: "10px",
            fontWeight: 400,
            color: "#555555",
            letterSpacing: "1.5px",
            marginTop: "2px",
          }}>
            by MX3
          </div>
        </div>

        {/* Tenant Selector */}
        <div className="px-4 py-4" style={{ borderBottom: "1px solid #222222" }}>
          <p className="sidebar-section-label">Organização</p>

          {/* Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowTenantDropdown(!showTenantDropdown)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm transition-all"
              style={{
                background: "#1a1a1a",
                color: "#FFFFFF",
                border: "1px solid #2a2a2a",
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 shrink-0" style={{ color: "#FF1A1A" }} />
                <span className="truncate">
                  {activeTenant?.name ?? "Selecionar tenant"}
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 transition-transform ${showTenantDropdown ? "rotate-180" : ""}`}
                style={{ color: "hsl(220, 9%, 50%)" }}
              />
            </button>

            {showTenantDropdown && (
              <div
                className="absolute top-full mt-1 left-0 right-0 rounded-lg overflow-hidden shadow-xl z-50 animate-fadeIn"
                style={{
                  background: "#111111",
                  border: "1px solid #2a2a2a",
                }}
              >
                {/* Campo de busca */}
                <div className="px-2 pt-2 pb-1" style={{ borderBottom: "1px solid #1e1e1e" }}>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "hsl(220, 9%, 40%)" }} />
                    <input
                      type="text"
                      placeholder="Buscar organização..."
                      value={tenantSearch}
                      onChange={(e) => setTenantSearch(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md"
                      style={{
                        background: "#1a1a1a",
                        border: "1px solid #2a2a2a",
                        color: "hsl(220, 14%, 80%)",
                        outline: "none",
                      }}
                      autoFocus
                    />
                  </div>
                </div>
                {/* Lista filtrada com scroll */}
                <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                {tenants
                  .filter((t) =>
                    !tenantSearch.trim() ||
                    t.name.toLowerCase().includes(tenantSearch.trim().toLowerCase())
                  )
                  .map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTenant(t.id, true)}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors"
                    style={{
                      color: t.id === activeTenantId ? "#FF1A1A" : "hsl(220, 14%, 70%)",
                      background:
                        t.id === activeTenantId ? "#1a0000" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (t.id !== activeTenantId)
                        (e.currentTarget as HTMLElement).style.background = "#1a1a1a";
                    }}
                    onMouseLeave={(e) => {
                      if (t.id !== activeTenantId)
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5" />
                      <span className="truncate">{t.name}</span>
                    </span>
                    {t.id === activeTenantId && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
                </div>

                <div style={{ borderTop: "1px solid #222222" }}>
                  {isAdmin && !showCreateTenant ? (
                    <button
                      onClick={() => setShowCreateTenant(true)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors"
                      style={{ color: "hsl(220, 9%, 50%)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "hsl(220, 14%, 80%)";
                        (e.currentTarget as HTMLElement).style.background = "#1a1a1a";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.color = "hsl(220, 9%, 50%)";
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Criar nova organização
                    </button>
                  ) : isAdmin && showCreateTenant ? (
                    <div className="p-2 space-y-2">
                      <input
                        type="text"
                        placeholder="Nome da organização"
                        value={newTenantName}
                        onChange={(e) => setNewTenantName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createTenant()}
                        className="w-full px-2.5 py-2 text-sm rounded-lg"
                        style={{
                          background: "#1a1a1a",
                          border: "1px solid #2a2a2a",
                          color: "hsl(220, 14%, 90%)",
                          outline: "none",
                        }}
                        autoFocus
                      />
                      <div className="flex gap-1.5">
                        <button
                          onClick={createTenant}
                          className="flex-1 py-1.5 text-xs rounded-lg font-medium"
                          style={{
                            background: "#FF1A1A",
                            color: "white",
                          }}
                        >
                          Criar
                        </button>
                        <button
                          onClick={() => { setShowCreateTenant(false); setNewTenantName(""); }}
                          className="flex-1 py-1.5 text-xs rounded-lg"
                          style={{
                            background: "#1a1a1a",
                            color: "hsl(220, 9%, 60%)",
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <p className="sidebar-section-label">Menu</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`sidebar-nav-item ${isActive ? "active" : ""}`}
              >
                <Icon className="nav-icon w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {navItems.length === 0 && (
            <p className="px-3 py-2 text-xs" style={{ color: "hsl(220, 9%, 40%)" }}>
              Selecione ou crie um tenant para navegar.
            </p>
          )}

          {/* Admin section — visível apenas para admins do sistema (ADMIN_EMAILS) */}
          {isAdmin && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #222222" }}>
              <p className="sidebar-section-label" style={{ color: "#FF1A1A", marginTop: "16px" }}>Admin</p>
              {[
                { label: "Visão Geral",  href: "/app/admin",                  icon: LayoutDashboard },
                { label: "Analytics",    href: "/app/admin/analytics",        icon: BarChart2       },
                { label: "Sandbox",      href: "/app/admin/sandbox",          icon: FlaskConical    },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-nav-item ${isActive ? "active" : ""}`}
                    style={isActive ? {} : { color: "hsl(45, 80%, 55%)" }}
                  >
                    <Icon className="nav-icon w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                background: "linear-gradient(135deg, #FF1A1A, #cc0000)",
                color: "white",
              }}
            >
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-medium truncate"
                style={{ color: "#FFFFFF" }}
              >
                {user.email}
              </p>
              <p className="text-xs" style={{ color: "#666666" }}>
                Conta ativa
              </p>
            </div>

            <button
              onClick={handleLogout}
              title="Sair"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0"
              style={{ color: "hsl(220, 9%, 50%)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#FF1A1A";
                (e.currentTarget as HTMLElement).style.background = "#1a0000";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "hsl(220, 9%, 50%)";
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 ml-64 min-h-screen">
        {/* ── Top bar (sempre visível) ── */}
        <header
          className="sticky top-0 z-20 flex items-center justify-end px-8"
          style={{ height: "52px", background: "#ffffff", borderBottom: "1px solid #f0f0f0" }}
        >
          {activeTenantId && (
            <div className="relative" ref={bellRef}>
              <button
                onClick={() => setShowBellDropdown(!showBellDropdown)}
                title="Notificações"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors relative"
                style={{ color: "#888888", background: "transparent" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f5f5f5"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <Bell className="w-4 h-4" />
                {showBellBadge && (
                  <span
                    className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2 border-white"
                    style={{ background: minutesStatus?.blocked ? "#dc2626" : "#f59e0b" }}
                  />
                )}
              </button>

              {showBellDropdown && (
                <div
                  className="absolute top-full mt-2 right-0 w-72 rounded-xl shadow-2xl z-50 overflow-hidden"
                  style={{ background: "#111111", border: "1px solid #2a2a2a" }}
                >
                  {showBellBadge ? (
                    <>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #222222" }}>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className={`w-4 h-4 ${minutesStatus?.blocked ? "text-red-500" : "text-amber-400"}`} />
                          <span className="text-sm font-semibold text-white">
                            {minutesStatus?.blocked ? "Conta bloqueada" : "Aviso de consumo"}
                          </span>
                        </div>
                        {!minutesStatus?.blocked && (
                          <button onClick={dismissBellNotification} className="text-gray-500 hover:text-gray-300 transition-colors">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {/* Body */}
                      <div className="px-4 py-3 space-y-3">
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {minutesStatus?.blocked
                            ? "Você atingiu 100% dos minutos contratados. Todas as campanhas foram pausadas automaticamente."
                            : `Você já consumiu ${minutesPct}% dos minutos contratados deste mês.`}
                        </p>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>{usedMinutes} min usados</span>
                            <span>{minutesStatus?.contracted} min contratados</span>
                          </div>
                          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#2a2a2a" }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, minutesPct)}%`,
                                background: minutesStatus?.blocked ? "#dc2626" : minutesPct >= 90 ? "#f97316" : "#f59e0b",
                              }}
                            />
                          </div>
                        </div>
                        <button
                          onClick={handleRequestMinutes}
                          disabled={sendingEmail}
                          className="w-full py-2 text-sm font-semibold rounded-lg transition-colors"
                          style={{ background: "#FF1A1A", color: "white" }}
                        >
                          {sendingEmail ? "Enviando..." : "Contratar mais minutos"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="px-4 py-4 text-sm text-gray-400 text-center">
                      Sem notificações no momento.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        <div style={{ maxWidth: "100%", padding: "32px 40px" }}>{children}</div>
      </main>

      {/* ── Toast notifications ── */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success" ? (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <X className="w-4 h-4 text-red-200 shrink-0" />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
