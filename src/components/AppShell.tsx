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

// ── Design tokens (inline for zero-dep styling) ──────────────────
const T = {
  red:         "#E8002D",
  redLo:       "rgba(232,0,45,0.18)",
  redGlow:     "rgba(232,0,45,0.35)",
  glass:       "rgba(255,255,255,0.04)",
  glass2:      "rgba(255,255,255,0.07)",
  glassBorder: "rgba(255,255,255,0.09)",
  text1:       "#FFFFFF",
  text2:       "rgba(255,255,255,0.58)",
  text3:       "rgba(255,255,255,0.28)",
  green:       "#00D68F",
  yellow:      "#FFB800",
  sidebar:     "rgba(6,6,8,0.90)",
  topbar:      "rgba(6,6,8,0.80)",
};

const SIDEBAR_W      = 242;
const SIDEBAR_W_COL  = 66;
const EASE           = "cubic-bezier(.4,0,.2,1)";
const TRANSITION     = `width 0.28s ${EASE}`;
const MARGIN_TRANS   = `margin-left 0.28s ${EASE}`;

// ── Inline SVG logo (CALL·X com X vermelho) ──────────────────────
function LogoSVG({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 1509 446"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width:      collapsed ? "0" : "90px",
        height:     "auto",
        flexShrink: 0,
        overflow:   "hidden",
        opacity:    collapsed ? 0 : 1,
        transition: `opacity 0.22s ${EASE}, width 0.28s ${EASE}`,
        color:      T.text1,
      }}
    >
      <path fill="currentColor" d="M 336.06 155.42 C 329.08 96.80 278.51 62.00 222.98 57.21 C 204.26 55.60 185.78 56.42 168.43 60.76 C 107.52 75.99 67.69 126.49 60.55 187.99 C 54.29 241.89 69.02 297.15 112.05 332.86 C 136.31 353.00 166.45 364.11 198.06 365.39 Q 221.85 366.35 243.21 361.77 C 293.33 351.03 330.68 312.83 336.06 261.41 A 0.50 0.49 -86.7 0 1 336.55 260.97 L 394.02 260.97 A 0.44 0.43 1.8 0 1 394.46 261.43 C 391.00 306.23 371.40 349.88 336.63 378.86 Q 306.07 404.34 267.03 414.30 C 247.02 419.41 226.38 421.57 205.55 421.52 Q 174.58 421.46 147.34 414.65 C 109.18 405.11 73.89 384.21 48.56 353.93 C 21.00 320.99 5.61 280.01 1.89 237.08 C -3.79 171.39 11.63 104.15 58.88 56.92 C 91.86 23.95 135.28 5.65 182.01 1.52 Q 218.98 -1.74 254.66 4.83 Q 294.47 12.16 327.16 34.81 C 367.28 62.61 390.15 106.61 393.92 155.35 A 0.60 0.60 0.0 0 1 393.32 156.00 L 336.72 156.00 A 0.67 0.66 -3.4 0 1 336.06 155.42 Z"/>
      <rect fill="currentColor" x="787.76" y="6.75" width="58.48" height="408.50" rx="0.41"/>
      <rect fill="currentColor" x="888.75" y="6.75" width="58.24" height="408.50" rx="0.42"/>
      <path fill="#ff1537" d="M 1331.34 238.15 C 1331.33 250.69 1329.45 263.03 1325.58 275.50 Q 1322.61 285.09 1312.29 304.09 Q 1311.97 304.69 1238.67 445.17 A 0.64 0.63 14.1 0 1 1238.11 445.50 L 1168.88 445.50 A 0.32 0.31 13.5 0 1 1168.59 445.04 Q 1228.04 331.67 1271.88 247.82 Q 1273.79 244.17 1273.79 238.14 Q 1273.79 232.12 1271.88 228.46 Q 1228.06 144.61 1168.64 31.22 A 0.32 0.31 -13.4 0 1 1168.93 30.76 L 1238.16 30.78 A 0.64 0.63 -14.1 0 1 1238.72 31.11 Q 1311.99 171.61 1312.31 172.21 Q 1322.62 191.21 1325.59 200.80 C 1329.45 213.27 1331.34 225.61 1331.34 238.15 Z"/>
      <path fill="#ff1537" d="M 1402.86 238.09 Q 1402.86 244.12 1404.77 247.77 Q 1448.60 331.62 1508.03 444.99 A 0.32 0.31 -13.5 0 1 1507.74 445.45 L 1438.52 445.44 A 0.64 0.63 -14.1 0 1 1437.96 445.11 Q 1364.68 304.63 1364.36 304.03 Q 1354.04 285.03 1351.07 275.44 C 1347.21 262.97 1345.32 250.64 1345.32 238.09 C 1345.32 225.55 1347.21 213.22 1351.07 200.75 Q 1354.04 191.16 1364.36 172.16 Q 1364.68 171.56 1437.96 31.08 A 0.64 0.63 14.1 0 1 1438.52 30.75 L 1507.75 30.74 A 0.32 0.31 13.5 0 1 1508.04 31.20 Q 1448.60 144.57 1404.77 228.41 Q 1402.86 232.07 1402.86 238.09 Z"/>
      <path fill="currentColor" d="M 441.96 215.20 C 443.01 175.68 457.04 141.94 489.74 119.48 C 512.95 103.54 539.99 96.59 567.91 95.38 Q 597.46 94.11 625.76 99.43 Q 642.55 102.58 657.74 109.49 Q 698.72 128.13 711.82 170.69 Q 717.90 190.45 718.11 213.32 Q 718.35 238.89 718.21 342.50 C 718.20 349.54 720.32 355.90 728.19 357.69 Q 731.18 358.37 744.90 358.24 A 0.59 0.58 89.5 0 1 745.49 358.83 L 745.49 414.62 A 0.64 0.64 0.0 0 1 744.85 415.26 Q 729.03 415.15 719.86 415.32 Q 705.87 415.57 698.00 413.40 C 676.03 407.35 664.40 385.93 663.65 363.96 Q 663.32 354.27 663.55 343.45 A 0.44 0.44 0.0 0 0 663.11 343.00 L 658.51 343.00 A 0.47 0.47 0.0 0 0 658.04 343.41 Q 656.67 354.29 656.03 358.00 C 652.77 377.04 641.34 391.33 625.22 401.53 Q 610.47 410.86 593.95 415.45 Q 562.17 424.28 528.26 420.38 C 509.24 418.19 491.10 412.68 475.42 402.04 Q 453.18 386.95 444.30 364.18 Q 436.17 343.36 437.90 318.25 C 440.85 275.45 470.67 252.20 509.68 242.19 Q 531.83 236.50 555.51 235.07 Q 566.51 234.41 577.75 234.00 Q 603.62 233.07 627.47 230.41 C 635.69 229.49 644.32 228.31 651.70 224.71 Q 661.76 219.81 661.03 208.26 Q 660.48 199.67 659.25 194.52 Q 653.11 168.90 630.30 156.67 C 619.31 150.78 606.40 148.22 593.22 147.19 C 559.27 144.53 521.09 152.67 505.97 186.72 Q 500.24 199.63 499.22 215.41 A 0.63 0.63 0.0 0 1 498.59 216.00 L 442.73 216.00 A 0.77 0.77 0.0 0 1 441.96 215.20 Z M 656.78 242.73 A 0.60 0.59 -86.1 0 0 656.19 243.25 C 655.77 246.35 655.25 252.55 653.85 255.85 C 646.16 274.05 623.47 274.87 606.85 276.73 C 585.08 279.17 560.26 280.98 544.79 283.10 C 521.74 286.27 495.12 295.72 494.24 323.56 C 493.90 334.15 496.75 343.84 503.73 351.29 C 518.32 366.85 541.23 370.11 561.40 369.14 C 592.58 367.64 628.40 357.37 649.08 332.84 Q 656.19 324.40 659.47 312.56 Q 661.32 305.89 661.02 290.32 Q 660.99 289.03 660.99 243.19 A 0.46 0.46 0.0 0 0 660.53 242.73 L 656.78 242.73 Z"/>
      <rect fill="#ff1537" x="1035.00" y="219.50" width="75.00" height="37.24" rx="0.39"/>
    </svg>
  );
}

// ── Sidebar panel toggle icon ────────────────────────────────────
function SidebarIcon() {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="0.75" y="0.75" width="16.5" height="14.5" rx="2"/>
      <line x1="5.5" y1="0.75" x2="5.5" y2="15.25"/>
      <line x1="8.5" y1="4.75" x2="14.5" y2="4.75"/>
      <line x1="8.5" y1="8"    x2="14.5" y2="8"/>
      <line x1="8.5" y1="11.25" x2="14.5" y2="11.25"/>
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────────
interface Tenant { id: string; name: string; timezone: string; }
interface ToastItem { id: string; message: string; type: "success" | "error"; }

// ════════════════════════════════════════════════════════════════
export default function AppShell({
  user,
  isAdmin = false,
  children,
}: {
  user: User;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  // ── State ────────────────────────────────────────────────────
  const [collapsed, setCollapsed]           = useState(false);
  const [tenants, setTenants]               = useState<Tenant[]>([]);
  const [tenantRoles, setTenantRoles]       = useState<Record<string, string>>({});
  const [activeTenantId, setActiveTenantId] = useState<string>("");
  const [rolesLoaded, setRolesLoaded]       = useState(false);
  const [showCreateTenant, setShowCreateTenant] = useState(false);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const [newTenantName, setNewTenantName]   = useState("");
  const [tenantSearch, setTenantSearch]     = useState("");
  const [toasts, setToasts]                 = useState<ToastItem[]>([]);

  // Bell / minutes
  const [minutesStatus, setMinutesStatus]   = useState<{
    contracted: number | null; usedSeconds: number; blocked: boolean; month: string | null;
  } | null>(null);
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [bellDismissed, setBellDismissed]   = useState(false);
  const [sendingEmail, setSendingEmail]     = useState(false);

  const bellRef     = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router      = useRouter();
  const pathname    = usePathname();
  const supabase    = createClient();

  // ── Effects (all original logic preserved) ───────────────────
  useEffect(() => { loadTenants(); }, []);

  useEffect(() => {
    if (!activeTenantId) return;
    fetch(`/api/tenants/${activeTenantId}/vapi-connection`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const conn = d?.connection;
        if (!conn || conn.contracted_minutes == null) { setMinutesStatus(null); return; }
        setMinutesStatus({
          contracted:  conn.contracted_minutes,
          usedSeconds: conn.minutes_used_cache ?? 0,
          blocked:     conn.minutes_blocked ?? false,
          month:       conn.minutes_cache_month ?? null,
        });
        const month = conn.minutes_cache_month ?? new Date().toISOString().slice(0, 7);
        const key   = `callx_notif_dismissed_${activeTenantId}_${month}`;
        setBellDismissed(localStorage.getItem(key) === "true");
      })
      .catch(() => setMinutesStatus(null));
  }, [activeTenantId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node))
        setShowBellDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowTenantDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  // ── Data functions (all original logic preserved) ─────────────
  async function loadTenants() {
    const res  = await fetch("/api/tenants");
    const data = await res.json();
    if (data.tenants) {
      const sorted = [...data.tenants].sort((a: Tenant, b: Tenant) =>
        a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
      );
      setTenants(sorted);
      const roles: Record<string, string> = {};
      sorted.forEach((t: Tenant & { role?: string }) => { if (t.id && t.role) roles[t.id] = t.role; });
      setTenantRoles(roles);
      const saved   = localStorage.getItem("activeTenantId");
      const validId = (saved && sorted.find((t: Tenant) => t.id === saved)) ? saved : sorted[0]?.id;
      if (validId) { setActiveTenantId(validId); localStorage.setItem("activeTenantId", validId); }
      setRolesLoaded(true);
    }
  }

  function selectTenant(id: string, navigate = false, rolesSnapshot?: Record<string, string>) {
    setActiveTenantId(id);
    localStorage.setItem("activeTenantId", id);
    setShowTenantDropdown(false);
    setTenantSearch("");
    if (navigate) {
      const resolvedRoles = rolesSnapshot ?? tenantRoles;
      const role          = resolvedRoles[id] ?? "member";
      const canAccessAll  = isAdmin || role === "owner" || role === "admin";
      const knownSections = ["queues","leads","calls","assistants","analytics","members","vapi"];
      const normSection   = (s: string) => s === "dossie" ? "analytics" : s;
      const sectionMatch  = pathname.match(/\/app\/tenants\/[^/]+\/([^/]+)/);
      const rawSection    = sectionMatch?.[1] ?? null;
      const currentSection = rawSection ? normSection(rawSection) : null;
      const keepSection   = currentSection && knownSections.includes(currentSection)
        && (canAccessAll || !["vapi","assistants","analytics","members"].includes(currentSection))
        ? currentSection : null;
      const destination   = keepSection
        ? `/app/tenants/${id}/${keepSection}`
        : canAccessAll ? `/app/tenants/${id}/vapi` : `/app/tenants/${id}/queues`;
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
    const res  = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTenantName }),
    });
    const data = await res.json();
    if (data.tenant) {
      const newRoles = { ...tenantRoles, [data.tenant.id]: "owner" };
      setTenantRoles(newRoles);
      setTenants((prev) =>
        [...prev, data.tenant].sort((a: Tenant, b: Tenant) =>
          a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
        )
      );
      selectTenant(data.tenant.id, false, newRoles);
      setNewTenantName(""); setShowCreateTenant(false);
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
    const key = `callx_notif_dismissed_${activeTenantId}_${minutesStatus.month}`;
    localStorage.setItem(key, "true");
    setBellDismissed(true);
    setShowBellDropdown(false);
  }

  // ── Derived state ────────────────────────────────────────────
  const usedMinutes     = minutesStatus ? Math.ceil(minutesStatus.usedSeconds / 60) : 0;
  const minutesPct      = minutesStatus?.contracted ? Math.round((usedMinutes / minutesStatus.contracted) * 100) : 0;
  const showBellBadge   = minutesStatus != null && minutesPct >= 80 && (!bellDismissed || minutesStatus.blocked);
  const activeTenant    = tenants.find((t) => t.id === activeTenantId);
  const activeRole      = tenantRoles[activeTenantId] ?? "member";
  const isAdminOrOwner  = rolesLoaded && (isAdmin || activeRole === "owner" || activeRole === "admin");
  const userInitials    = user.email ? user.email.substring(0, 2).toUpperCase() : "??";

  const navItems = (activeTenantId && rolesLoaded) ? [
    { label: "Relatórios",       href: `/app/tenants/${activeTenantId}/analytics`,        icon: BarChart2    },
    { label: "Lista de Leads",   href: `/app/tenants/${activeTenantId}/leads`,            icon: Users        },
    { label: "Campanhas",        href: `/app/tenants/${activeTenantId}/queues`,           icon: ListOrdered  },
    { label: "Chamadas",         href: `/app/tenants/${activeTenantId}/calls`,            icon: PhoneCall    },
    { label: "Assistentes",      href: `/app/tenants/${activeTenantId}/assistants`,       icon: Bot          },
    { label: "Membros",          href: `/app/tenants/${activeTenantId}/members`,          icon: UserCheck    },
    ...(isAdminOrOwner ? [
      { label: "Dossiê Comercial", href: `/app/tenants/${activeTenantId}/analytics/dossie`, icon: FileBarChart2 },
      { label: "Configurações",    href: `/app/tenants/${activeTenantId}/vapi`,              icon: Settings2     },
    ] : []),
  ] : [];

  const sidebarW = collapsed ? SIDEBAR_W_COL : SIDEBAR_W;

  // ── Render ───────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "#060608", position: "relative" }}>

      {/* ── Gradient background ──────────────────────────────── */}
      <div aria-hidden style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse 80% 60% at 10% 0%,   rgba(232,0,45,0.10) 0%, transparent 60%),
          radial-gradient(ellipse 60% 50% at 90% 20%,  rgba(0,194,255,0.06) 0%, transparent 55%),
          radial-gradient(ellipse 55% 45% at 50% 100%, rgba(168,85,247,0.06) 0%, transparent 55%)
        `,
      }}/>

      {/* ════ SIDEBAR ══════════════════════════════════════════ */}
      <aside style={{
        width:            sidebarW,
        minWidth:         sidebarW,
        height:           "100vh",
        position:         "fixed",
        left:             0,
        top:              0,
        zIndex:           40,
        display:          "flex",
        flexDirection:    "column",
        background:       T.sidebar,
        backdropFilter:   "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderRight:      `1px solid ${T.glassBorder}`,
        transition:       TRANSITION,
        overflow:         "hidden",
      }}>

        {/* Top glow */}
        <div aria-hidden style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 160,
          background: "linear-gradient(180deg, rgba(232,0,45,0.06) 0%, transparent 100%)",
          pointerEvents: "none",
        }}/>

        {/* ── Logo + Toggle ──────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: collapsed ? "0 16px" : "0 14px",
          minHeight: 64, borderBottom: `1px solid ${T.glassBorder}`,
          justifyContent: collapsed ? "center" : "space-between",
          transition: `padding 0.28s ${EASE}`,
        }}>
          <LogoSVG collapsed={collapsed} />
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expandir menu" : "Colapsar menu"}
            style={{
              flexShrink:    0,
              width:         32, height: 32,
              borderRadius:  9,
              background:    T.glass,
              border:        `1px solid ${T.glassBorder}`,
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              cursor:        "pointer",
              color:         T.text2,
              transition:    "background 0.15s, color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = T.redLo;
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,0,45,0.30)";
              (e.currentTarget as HTMLElement).style.color = T.red;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = T.glass;
              (e.currentTarget as HTMLElement).style.borderColor = T.glassBorder;
              (e.currentTarget as HTMLElement).style.color = T.text2;
            }}
          >
            <SidebarIcon />
          </button>
        </div>

        {/* ── Tenant Selector ────────────────────────────────── */}
        {!collapsed && (
          <div style={{ padding: "12px 10px 8px", borderBottom: `1px solid ${T.glassBorder}` }}>
            <p className="sidebar-section-label">Organização</p>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowTenantDropdown(!showTenantDropdown)}
                style={{
                  width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "space-between", gap: 8,
                  padding: "10px 12px", borderRadius: 12,
                  background: T.glass, border: `1px solid ${T.glassBorder}`,
                  color: T.text1, cursor: "pointer", fontSize: 13,
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = T.glass2;
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(232,0,45,0.25)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = T.glass;
                  (e.currentTarget as HTMLElement).style.borderColor = T.glassBorder;
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                  <Building2 style={{ width: 14, height: 14, flexShrink: 0, color: T.red }}/>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeTenant?.name ?? "Selecionar tenant"}
                  </span>
                </span>
                <ChevronDown
                  style={{
                    width: 14, height: 14, flexShrink: 0, color: T.text3,
                    transform: showTenantDropdown ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                  }}
                />
              </button>

              {showTenantDropdown && (
                <div className="animate-fadeIn" style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                  borderRadius: 12, overflow: "hidden",
                  background: "rgba(10,10,14,0.95)",
                  backdropFilter: "blur(16px)",
                  border: `1px solid ${T.glassBorder}`,
                  boxShadow: "0 16px 48px rgba(0,0,0,0.50)",
                  zIndex: 50,
                }}>
                  {/* Search */}
                  <div style={{ padding: "8px 8px 6px", borderBottom: `1px solid ${T.glassBorder}` }}>
                    <div style={{ position: "relative" }}>
                      <Search style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: T.text3 }}/>
                      <input
                        type="text" placeholder="Buscar organização..."
                        value={tenantSearch} onChange={(e) => setTenantSearch(e.target.value)}
                        style={{
                          width: "100%", paddingLeft: 28, paddingRight: 8,
                          paddingTop: 6, paddingBottom: 6,
                          fontSize: 12, borderRadius: 8,
                          background: T.glass, border: `1px solid ${T.glassBorder}`,
                          color: T.text1, outline: "none",
                        }}
                        autoFocus
                      />
                    </div>
                  </div>
                  {/* List */}
                  <div style={{ maxHeight: 220, overflowY: "auto" }}>
                    {tenants
                      .filter((t) => !tenantSearch.trim() || t.name.toLowerCase().includes(tenantSearch.trim().toLowerCase()))
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => selectTenant(t.id, true)}
                          style={{
                            width: "100%", display: "flex", alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px", fontSize: 13, cursor: "pointer",
                            background:  t.id === activeTenantId ? "rgba(232,0,45,0.12)" : "transparent",
                            color:       t.id === activeTenantId ? T.red : T.text2,
                            transition:  "background 0.12s",
                          }}
                          onMouseEnter={(e) => { if (t.id !== activeTenantId) (e.currentTarget as HTMLElement).style.background = T.glass2; }}
                          onMouseLeave={(e) => { if (t.id !== activeTenantId) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Building2 style={{ width: 13, height: 13 }}/>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                          </span>
                          {t.id === activeTenantId && <Check style={{ width: 13, height: 13 }}/>}
                        </button>
                      ))}
                  </div>
                  {/* Create */}
                  <div style={{ borderTop: `1px solid ${T.glassBorder}` }}>
                    {isAdmin && !showCreateTenant && (
                      <button
                        onClick={() => setShowCreateTenant(true)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 8,
                          padding: "10px 12px", fontSize: 13, cursor: "pointer",
                          color: T.text3, background: "transparent", transition: "all 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.color = T.text1;
                          (e.currentTarget as HTMLElement).style.background = T.glass;
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = T.text3;
                          (e.currentTarget as HTMLElement).style.background = "transparent";
                        }}
                      >
                        <Plus style={{ width: 13, height: 13 }}/> Criar nova organização
                      </button>
                    )}
                    {isAdmin && showCreateTenant && (
                      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                        <input
                          type="text" placeholder="Nome da organização"
                          value={newTenantName} onChange={(e) => setNewTenantName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && createTenant()}
                          style={{
                            width: "100%", padding: "8px 10px", fontSize: 13, borderRadius: 8,
                            background: T.glass, border: `1px solid ${T.glassBorder}`,
                            color: T.text1, outline: "none",
                          }}
                          autoFocus
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={createTenant} style={{
                            flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, borderRadius: 8,
                            background: `linear-gradient(135deg, ${T.red}, #c8001f)`, color: "#fff", cursor: "pointer",
                          }}>Criar</button>
                          <button onClick={() => { setShowCreateTenant(false); setNewTenantName(""); }} style={{
                            flex: 1, padding: "6px 0", fontSize: 12, borderRadius: 8,
                            background: T.glass, color: T.text2, border: `1px solid ${T.glassBorder}`, cursor: "pointer",
                          }}>Cancelar</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Navigation ─────────────────────────────────────── */}
        <nav style={{ flex: 1, padding: "8px 8px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {!collapsed && (
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: T.text3, padding: "8px 8px 4px" }}>
              Menu
            </p>
          )}

          {navItems.map((item) => {
            const Icon     = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.label}
                href={item.href}
                title={collapsed ? item.label : undefined}
                style={{
                  display:       "flex",
                  alignItems:    "center",
                  gap:           collapsed ? 0 : 10,
                  padding:       collapsed ? "9px 0" : "9px 10px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  borderRadius:  12,
                  fontSize:      13,
                  fontWeight:    500,
                  textDecoration:"none",
                  color:         isActive ? "#fff" : T.text2,
                  background:    isActive
                    ? "linear-gradient(135deg, rgba(232,0,45,0.25), rgba(232,0,45,0.12))"
                    : "transparent",
                  border:        isActive ? "1px solid rgba(232,0,45,0.30)" : "1px solid transparent",
                  boxShadow:     isActive ? "0 4px 20px rgba(232,0,45,0.12)" : "none",
                  transition:    "all 0.15s",
                  whiteSpace:    "nowrap",
                  overflow:      "hidden",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = T.glass2;
                    (e.currentTarget as HTMLElement).style.color = T.text1;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = T.text2;
                  }
                }}
              >
                <Icon style={{ width: 16, height: 16, flexShrink: 0 }}/>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          {navItems.length === 0 && !collapsed && (
            <p style={{ padding: "8px 10px", fontSize: 12, color: T.text3 }}>
              Selecione ou crie um tenant para navegar.
            </p>
          )}

          {/* Admin section */}
          {isAdmin && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.glassBorder}` }}>
              {!collapsed && (
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
                            color: "rgba(232,0,45,0.6)", padding: "4px 8px 8px" }}>
                  Admin
                </p>
              )}
              {[
                { label: "Visão Geral", href: "/app/admin",            icon: LayoutDashboard, color: T.yellow },
                { label: "Analytics",   href: "/app/admin/analytics",  icon: BarChart2,       color: T.red    },
                { label: "Sandbox",     href: "/app/admin/sandbox",    icon: FlaskConical,    color: T.green  },
              ].map((item) => {
                const Icon     = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href}
                    title={collapsed ? item.label : undefined}
                    style={{
                      display:       "flex", alignItems: "center", gap: collapsed ? 0 : 10,
                      padding:       collapsed ? "9px 0" : "9px 10px",
                      justifyContent: collapsed ? "center" : "flex-start",
                      borderRadius:  12, fontSize: 13, fontWeight: 500,
                      textDecoration:"none",
                      color:         isActive ? "#fff" : item.color,
                      background:    isActive ? `linear-gradient(135deg, rgba(232,0,45,0.25), rgba(232,0,45,0.12))` : "transparent",
                      border:        isActive ? "1px solid rgba(232,0,45,0.30)" : "1px solid transparent",
                      transition:    "all 0.15s", whiteSpace: "nowrap", overflow: "hidden",
                    }}
                    onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = T.glass2; }}
                    onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <Icon style={{ width: 16, height: 16, flexShrink: 0, color: isActive ? "#fff" : item.color }}/>
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* ── Footer ─────────────────────────────────────────── */}
        <div style={{
          padding:    collapsed ? "12px 0" : "12px 10px",
          borderTop:  `1px solid ${T.glassBorder}`,
          display:    "flex",
          alignItems: "center",
          gap:        10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: `linear-gradient(135deg, ${T.red}, #ff4d6d)`,
            boxShadow:  "0 0 12px rgba(232,0,45,0.35)",
            display:    "flex", alignItems: "center", justifyContent: "center",
            fontSize:   11, fontWeight: 700, color: "#fff", flexShrink: 0,
          }}>
            {userInitials}
          </div>

          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </p>
                <p style={{ fontSize: 10, color: T.green }}>● Conta ativa</p>
              </div>
              <button onClick={handleLogout} title="Sair" style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.text3, background: "transparent", cursor: "pointer",
                transition: "color 0.15s, background 0.15s",
              }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = T.red;
                  (e.currentTarget as HTMLElement).style.background = T.redLo;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = T.text3;
                  (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <LogOut style={{ width: 15, height: 15 }}/>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ════ MAIN ════════════════════════════════════════════ */}
      <main style={{
        flex:           1,
        marginLeft:     sidebarW,
        minHeight:      "100vh",
        display:        "flex",
        flexDirection:  "column",
        position:       "relative",
        zIndex:         1,
        transition:     MARGIN_TRANS,
      }}>

        {/* ── Topbar ─────────────────────────────────────────── */}
        <header style={{
          position:       "sticky",
          top:            0,
          zIndex:         20,
          height:         56,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "flex-end",
          padding:        "0 28px",
          background:     T.topbar,
          backdropFilter: "blur(20px) saturate(150%)",
          WebkitBackdropFilter: "blur(20px) saturate(150%)",
          borderBottom:   `1px solid ${T.glassBorder}`,
        }}>
          {activeTenantId && (
            <div style={{ position: "relative" }} ref={bellRef}>
              <button
                onClick={() => setShowBellDropdown(!showBellDropdown)}
                title="Notificações"
                style={{
                  width: 36, height: 36, borderRadius: 10, position: "relative",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.text2, background: T.glass, border: `1px solid ${T.glassBorder}`,
                  cursor: "pointer", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = T.glass2;
                  (e.currentTarget as HTMLElement).style.color = T.text1;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = T.glass;
                  (e.currentTarget as HTMLElement).style.color = T.text2;
                }}
              >
                <Bell style={{ width: 15, height: 15 }}/>
                {showBellBadge && (
                  <span style={{
                    position: "absolute", top: 6, right: 6,
                    width: 8, height: 8, borderRadius: "50%",
                    border: "2px solid #060608",
                    background: minutesStatus?.blocked ? "#dc2626" : T.yellow,
                  }}/>
                )}
              </button>

              {showBellDropdown && (
                <div className="animate-fadeIn" style={{
                  position: "absolute", top: "calc(100% + 8px)", right: 0, width: 280,
                  borderRadius: 14, overflow: "hidden",
                  background: "rgba(10,10,14,0.95)",
                  backdropFilter: "blur(16px)",
                  border: `1px solid ${T.glassBorder}`,
                  boxShadow: "0 16px 48px rgba(0,0,0,0.50)",
                  zIndex: 50,
                }}>
                  {showBellBadge ? (
                    <>
                      <div style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "12px 16px", borderBottom: `1px solid ${T.glassBorder}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AlertTriangle style={{ width: 15, height: 15, color: minutesStatus?.blocked ? "#dc2626" : T.yellow }}/>
                          <span style={{ fontSize: 13, fontWeight: 600, color: T.text1 }}>
                            {minutesStatus?.blocked ? "Conta bloqueada" : "Aviso de consumo"}
                          </span>
                        </div>
                        {!minutesStatus?.blocked && (
                          <button onClick={dismissBellNotification} style={{ color: T.text3, cursor: "pointer", transition: "color 0.15s" }}
                            onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = T.text1}
                            onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = T.text3}
                          >
                            <X style={{ width: 13, height: 13 }}/>
                          </button>
                        )}
                      </div>
                      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                        <p style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>
                          {minutesStatus?.blocked
                            ? "Você atingiu 100% dos minutos contratados. Todas as campanhas foram pausadas automaticamente."
                            : `Você já consumiu ${minutesPct}% dos minutos contratados deste mês.`}
                        </p>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.text3, marginBottom: 4 }}>
                            <span>{usedMinutes} min usados</span>
                            <span>{minutesStatus?.contracted} min contratados</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%", borderRadius: 999,
                              width: `${Math.min(100, minutesPct)}%`,
                              background: minutesStatus?.blocked ? "#dc2626" : minutesPct >= 90 ? "#f97316" : T.yellow,
                              boxShadow: "0 0 10px rgba(255,184,0,0.4)",
                            }}/>
                          </div>
                        </div>
                        <button
                          onClick={handleRequestMinutes}
                          disabled={sendingEmail}
                          style={{
                            width: "100%", padding: "9px 0", fontSize: 13, fontWeight: 600, borderRadius: 10,
                            background: `linear-gradient(135deg, ${T.red}, #c8001f)`,
                            color: "#fff", cursor: sendingEmail ? "not-allowed" : "pointer",
                            opacity: sendingEmail ? 0.6 : 1,
                            boxShadow: "0 4px 16px rgba(232,0,45,0.30)",
                          }}
                        >
                          {sendingEmail ? "Enviando..." : "Contratar mais minutos"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: "16px", fontSize: 13, color: T.text3, textAlign: "center" }}>
                      Sem notificações no momento.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </header>

        {/* ── Page content ───────────────────────────────────── */}
        <div style={{ flex: 1, padding: "32px 40px", maxWidth: "100%" }}>
          {children}
        </div>
      </main>

      {/* ════ TOASTS ══════════════════════════════════════════ */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success"
              ? <Check style={{ width: 15, height: 15, flexShrink: 0 }}/>
              : <X     style={{ width: 15, height: 15, flexShrink: 0 }}/>
            }
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
