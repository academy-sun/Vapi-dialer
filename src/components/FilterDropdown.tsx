"use client";
import { useState, useEffect, useRef, useLayoutEffect, type ReactNode } from "react";
import { ChevronDown, Check, X } from "lucide-react";

interface FilterDropdownShellProps {
  buttonLabel: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  minWidth?: number;
  panelMinWidth?: number;
  children: (close: () => void) => ReactNode;
}

/**
 * Dropdown base para filtros. Usa `position: fixed` + portal-like (render no body do document)
 * para escapar de qualquer contexto de `overflow: hidden` dos containers pais.
 */
export function FilterDropdownShell({
  buttonLabel, icon, active, minWidth = 200, panelMinWidth = 280, children,
}: FilterDropdownShellProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  // Recalcula posição no abrir, em scroll, resize
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (!btnRef.current) return;
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  // Click fora fecha
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="cx-select"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          minWidth,
          justifyContent: 'space-between',
          ...(active ? { borderColor: 'var(--red)' } : null),
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0, flex: 1 }}>
          {icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {buttonLabel}
          </span>
        </span>
        <ChevronDown
          style={{
            width: 14, height: 14, flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s',
          }}
        />
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 200,
            minWidth: panelMinWidth,
            maxHeight: 380,
            overflowY: 'auto',
            background: 'var(--glass-bg-2)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            border: '1px solid var(--glass-border)',
            borderRadius: 12,
            boxShadow: '0 12px 48px rgba(0,0,0,0.30)',
            padding: 6,
          }}
        >
          {children(close)}
        </div>
      )}
    </>
  );
}

interface FilterCheckItemProps {
  checked: boolean;
  onToggle: () => void;
  label: ReactNode;
  count?: number;
}

export function FilterCheckItem({ checked, onToggle, label, count }: FilterCheckItemProps) {
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--text-1)',
        transition: 'background .12s',
        background: checked ? 'var(--red-lo)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!checked) (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)';
      }}
      onMouseLeave={(e) => {
        if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        style={{ accentColor: 'var(--red)', flexShrink: 0 }}
      />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          {count}
        </span>
      )}
    </label>
  );
}

interface FilterRadioItemProps {
  checked: boolean;
  onSelect: () => void;
  label: ReactNode;
  count?: number;
}

export function FilterRadioItem({ checked, onSelect, label, count }: FilterRadioItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '8px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--text-1)',
        textAlign: 'left',
        transition: 'background .12s',
        background: checked ? 'var(--red-lo)' : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!checked) (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)';
      }}
      onMouseLeave={(e) => {
        if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {checked
        ? <Check style={{ width: 13, height: 13, color: 'var(--red)', flexShrink: 0 }} />
        : <span style={{ width: 13, height: 13, flexShrink: 0 }} />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          {count}
        </span>
      )}
    </button>
  );
}

export function FilterClearFooter({ onClear, label = "Limpar seleção" }: { onClear: () => void; label?: string }) {
  return (
    <>
      <div style={{ height: 1, background: 'var(--glass-border)', margin: '6px 0' }} />
      <button
        type="button"
        onClick={onClear}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-3)',
          background: 'transparent',
        }}
      >
        <X style={{ width: 12, height: 12 }} /> {label}
      </button>
    </>
  );
}
