"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  RefreshCw,
  PhoneCall,
  X,
  Check,
  AlertTriangle,
  Phone,
  Clock,
  DollarSign,
  Calendar,
  Filter,
} from "lucide-react";

interface Call {
  id: string;
  vapi_call_id: string;
  status: string | null;
  ended_reason: string | null;
  cost: number | null;
  summary: string | null;
  created_at: string;
  leads: { phone_e164: string; data_json: Record<string, string> } | null;
}

interface CallDetail extends Call {
  transcript: string | null;
}

const REASON_CONFIG: Record<string, { label: string; badge: string }> = {
  "customer-ended-call": { label: "Cliente encerrou", badge: "badge-green" },
  "assistant-ended-call": { label: "Assistente encerrou", badge: "badge-blue" },
  "no-answer": { label: "Sem resposta", badge: "badge-gray" },
  "busy": { label: "Ocupado", badge: "badge-yellow" },
  "voicemail": { label: "Caixa postal", badge: "badge-purple" },
  "failed": { label: "Falha", badge: "badge-red" },
};

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12) {
    return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatRelativeTime(dateStr: string): { relative: string; full: string } {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  let relative: string;
  if (diff < 60) relative = "agora mesmo";
  else if (diff < 3600) relative = `há ${Math.floor(diff / 60)} min`;
  else if (diff < 86400) relative = `há ${Math.floor(diff / 3600)} h`;
  else relative = `há ${Math.floor(diff / 86400)} dias`;
  const full = date.toLocaleString("pt-BR");
  return { relative, full };
}

interface ToastMsg { id: string; message: string; type: "success" | "error" }
function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const show = useCallback((message: string, type: ToastMsg["type"] = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);
  return { toasts, show };
}

export default function CallsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [calls, setCalls] = useState<Call[]>([]);
  const [selected, setSelected] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterReason, setFilterReason] = useState("all");
  const [searchPhone, setSearchPhone] = useState("");
  const { toasts, show: showToast } = useToast();

  useEffect(() => { loadCalls(); }, [tenantId]);

  async function loadCalls(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    const res = await fetch(`/api/tenants/${tenantId}/calls?limit=100`);
    const data = await res.json();
    setCalls(data.calls ?? []);
    setLoading(false);
    setRefreshing(false);
    if (showRefresh) showToast("Chamadas atualizadas!");
  }

  async function openDetail(callId: string) {
    const res = await fetch(`/api/tenants/${tenantId}/calls/${callId}`);
    const data = await res.json();
    setSelected(data.call);
  }

  const filteredCalls = calls.filter((c) => {
    const matchReason = filterReason === "all" || c.ended_reason === filterReason;
    const matchPhone = !searchPhone || (c.leads?.phone_e164 ?? "").includes(searchPhone.replace(/\D/g, ""));
    return matchReason && matchPhone;
  });

  const totalCost = calls.reduce((sum, c) => sum + (c.cost ?? 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Chamadas</h1>
          <p className="page-subtitle">
            {calls.length > 0 && `${calls.length} chamadas registradas · Custo total: $${totalCost.toFixed(4)}`}
          </p>
        </div>
        <button
          onClick={() => loadCalls(true)}
          className="btn-secondary"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      {calls.length > 0 && (
        <div className="card px-4 py-3 mb-5 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            type="text"
            className="form-input max-w-xs text-sm"
            placeholder="Buscar por telefone..."
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
          />
          <select
            className="select-native text-sm py-2.5 max-w-xs"
            value={filterReason}
            onChange={(e) => setFilterReason(e.target.value)}
          >
            <option value="all">Todos os resultados</option>
            {Object.entries(REASON_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          {(filterReason !== "all" || searchPhone) && (
            <button
              onClick={() => { setFilterReason("all"); setSearchPhone(""); }}
              className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Limpar filtros
            </button>
          )}
        </div>
      )}

      <div className="flex gap-5">
        {/* Lista */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="table-wrapper">
              <div className="divide-y divide-gray-50">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="px-5 py-4 flex gap-5">
                    <div className="skeleton h-4 w-36" />
                    <div className="skeleton h-4 w-24 rounded-full" />
                    <div className="skeleton h-4 w-16" />
                    <div className="skeleton h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ) : filteredCalls.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg viewBox="0 0 64 64" fill="none" className="w-full h-full">
                    <circle cx="32" cy="32" r="24" fill="#e0e7ff" />
                    <path d="M24 24c0-1.1.9-2 2-2h2l3 7-2 2c1.5 3 4 5.5 7 7l2-2 7 3v2c0 1.1-.9 2-2 2-10 0-19-9-19-19Z" fill="#6366f1" opacity=".6" />
                    <path d="M24 24c0-1.1.9-2 2-2h2l3 7-2 2c1.5 3 4 5.5 7 7l2-2 7 3v2c0 1.1-.9 2-2 2-10 0-19-9-19-19Z" stroke="#4f46e5" strokeWidth="1.5" fill="none" />
                  </svg>
                </div>
                <p className="empty-state-title">
                  {calls.length === 0
                    ? "Nenhuma chamada registrada ainda"
                    : "Nenhuma chamada encontrada"}
                </p>
                <p className="empty-state-desc">
                  {calls.length === 0
                    ? "As chamadas aparecerão aqui após iniciar uma fila de discagem."
                    : "Tente ajustar os filtros de busca."}
                </p>
              </div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th><span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />Telefone</span></th>
                    <th>Resultado</th>
                    <th><span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" />Custo</span></th>
                    <th><span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Data</span></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCalls.map((call) => {
                    const reason = REASON_CONFIG[call.ended_reason ?? ""] ?? { label: call.ended_reason ?? "Em andamento", badge: "badge-indigo" };
                    const { relative, full } = formatRelativeTime(call.created_at);
                    const isSelected = selected?.id === call.id;
                    return (
                      <tr
                        key={call.id}
                        onClick={() => openDetail(call.id)}
                        className={isSelected ? "bg-indigo-50/60" : ""}
                      >
                        <td className="font-mono font-medium text-gray-900">
                          {call.leads ? formatPhone(call.leads.phone_e164) : "—"}
                        </td>
                        <td>
                          <span className={reason.badge}>{reason.label}</span>
                        </td>
                        <td className="text-gray-600">
                          {call.cost != null ? (
                            <span className="font-mono">${call.cost.toFixed(4)}</span>
                          ) : "—"}
                        </td>
                        <td>
                          <span title={full} className="text-gray-500 cursor-help">
                            {relative}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  {filteredCalls.length} de {calls.length} chamadas
                </p>
                <p className="text-xs text-gray-500">
                  Clique em uma linha para ver detalhes
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Drawer lateral */}
        {selected && (
          <div className="w-80 shrink-0">
            <div className="card sticky top-8">
              <div className="card-header flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <PhoneCall className="w-4 h-4 text-indigo-500" />
                  Detalhe da Chamada
                </h2>
                <button
                  onClick={() => setSelected(null)}
                  className="btn-icon text-gray-400 hover:text-gray-600 text-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="card-body space-y-4">
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Telefone</dt>
                    <dd className="font-mono text-sm font-medium text-gray-900 mt-0.5">
                      {selected.leads ? formatPhone(selected.leads.phone_e164) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Resultado</dt>
                    <dd className="mt-0.5">
                      {(() => {
                        const r = REASON_CONFIG[selected.ended_reason ?? ""] ?? { label: selected.ended_reason ?? "—", badge: "badge-gray" };
                        return <span className={r.badge}>{r.label}</span>;
                      })()}
                    </dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custo</dt>
                      <dd className="font-mono text-sm text-gray-900 mt-0.5">
                        {selected.cost != null ? `$${selected.cost.toFixed(4)}` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Data</dt>
                      <dd className="text-sm text-gray-700 mt-0.5">
                        {new Date(selected.created_at).toLocaleString("pt-BR")}
                      </dd>
                    </div>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vapi Call ID</dt>
                    <dd className="font-mono text-xs text-gray-600 break-all mt-0.5 bg-gray-50 rounded px-2 py-1.5">
                      {selected.vapi_call_id}
                    </dd>
                  </div>
                </dl>

                {selected.summary && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Resumo</p>
                    <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-3 leading-relaxed">
                      {selected.summary}
                    </p>
                  </div>
                )}

                {selected.transcript && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Transcrição</p>
                    <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-3 whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">
                      {selected.transcript}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={t.type === "success" ? "toast-success" : "toast-error"}>
            {t.type === "success" ? <Check className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
