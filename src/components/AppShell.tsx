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
  BarChart3,
  LogOut,
  Plus,
  ChevronDown,
  Building2,
  Check,
  X,
  FlaskConical,
  LayoutDashboard,
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
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    loadTenants();
    const saved = localStorage.getItem("activeTenantId");
    if (saved) setActiveTenantId(saved);
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

  async function loadTenants() {
    const res = await fetch("/api/tenants");
    const data = await res.json();
    if (data.tenants) {
      setTenants(data.tenants);
      // popular mapa de roles
      const roles: Record<string, string> = {};
      data.tenants.forEach((t: Tenant & { role?: string }) => {
        if (t.id && t.role) roles[t.id] = t.role;
      });
      setTenantRoles(roles);
      const saved = localStorage.getItem("activeTenantId");
      if (!saved && data.tenants.length > 0) {
        selectTenant(data.tenants[0].id);
      }
    }
  }

  function selectTenant(id: string, navigate = false) {
    setActiveTenantId(id);
    localStorage.setItem("activeTenantId", id);
    setShowTenantDropdown(false);
    if (navigate) {
      const role = tenantRoles[id] ?? "member";
      const destination = (role === "owner" || role === "admin")
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
      setTenants((prev) => [...prev, data.tenant]);
      selectTenant(data.tenant.id);
      setNewTenantName("");
      setShowCreateTenant(false);
      showToast(`Tenant "${data.tenant.name}" criado com sucesso!`);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const activeTenant = tenants.find((t) => t.id === activeTenantId);

  const activeRole = tenantRoles[activeTenantId] ?? "member";
  const isAdminOrOwner = activeRole === "owner" || activeRole === "admin";

  const navItems = activeTenantId
    ? [
        ...(isAdminOrOwner ? [{
          label: "Configuração Vapi",
          href: `/app/tenants/${activeTenantId}/vapi`,
          icon: Settings2,
        }] : []),
        {
          label: "Lead Lists",
          href: `/app/tenants/${activeTenantId}/leads`,
          icon: Users,
        },
        {
          label: "Filas de Discagem",
          href: `/app/tenants/${activeTenantId}/queues`,
          icon: ListOrdered,
        },
        {
          label: "Chamadas",
          href: `/app/tenants/${activeTenantId}/calls`,
          icon: PhoneCall,
        },
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
            POWERED BY AI
          </div>
        </div>

        {/* Tenant Selector */}
        <div className="px-4 py-4" style={{ borderBottom: "1px solid #222222" }}>
          <p className="sidebar-section-label">Tenant Ativo</p>

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
                {tenants.map((t) => (
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

                <div style={{ borderTop: "1px solid #222222" }}>
                  {!showCreateTenant ? (
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
                      Criar novo tenant
                    </button>
                  ) : (
                    <div className="p-2 space-y-2">
                      <input
                        type="text"
                        placeholder="Nome do tenant"
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
                  )}
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
                key={item.href}
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

          {/* Admin section */}
          {isAdmin && (
            <div className="mt-4 pt-4" style={{ borderTop: "1px solid #222222" }}>
              <p className="sidebar-section-label" style={{ color: "hsl(45, 80%, 55%)" }}>Admin</p>
              {[
                { label: "Visão Geral",  href: "/app/admin",         icon: LayoutDashboard },
                { label: "Sandbox",      href: "/app/admin/sandbox", icon: FlaskConical    },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = pathname.startsWith(item.href);
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
      <main className="flex-1 ml-64 min-h-screen overflow-auto">
        <div className="max-w-6xl mx-auto px-8 py-8">{children}</div>
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
