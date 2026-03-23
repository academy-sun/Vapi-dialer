"use client";
import { useEffect, useState } from "react";
import { getAgentsStatus } from "./actions";
import { 
  Users, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Lock, 
  Unlock,
  RefreshCw,
  Cpu
} from "lucide-react";

interface Agent {
  status: 'livre' | 'ocupado';
  especialidade: string | null;
  llm: string | null;
  atividade_atual: number | null;
  ultima_vez: string;
}

interface ActivityItem {
  id: number;
  titulo: string;
  responsavel: string;
  skill: string | null;
  status: 'pendente' | 'em_andamento' | 'concluida' | 'falhou';
  criado_em: string;
  iniciado_em: string | null;
  tokens_estimados: string | null;
}

interface MonitorStatus {
  atividades: ActivityItem[];
  agentes: Record<string, Agent>;
  hasLock: boolean;
  lockPid: string | null;
}

export default function AgentsMonitorPage() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('todas');

  const fetchStatus = async () => {
    setRefreshing(true);
    const result = await getAgentsStatus();
    if (result.success) {
      setStatus(result.data);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const handleResetLock = async () => {
    if (!confirm("Tem certeza que deseja remover a trava manualmente? Isso pode interromper um agente ativo.")) return;
    const result = await (await import("./actions")).resetAgentLock();
    if (result.success) {
      alert("Trava removida!");
      fetchStatus();
    } else {
      alert("Erro: " + result.error);
    }
  };

  const formatDistanceToNow = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "agora";
    if (minutes < 60) return `há ${minutes}min`;
    const hours = Math.floor(minutes / 60);
    return `há ${hours}h`;
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const activities = status?.atividades || [];
  const agentes = Object.entries(status?.agentes || {});
  const hasLock = status?.hasLock;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Monitor de Agentes</h1>
          <p className="text-gray-500 mt-1">Status em tempo real da equipe MX3 CallX</p>
        </div>
        <button 
          onClick={fetchStatus}
          disabled={refreshing}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Atualizar agora
        </button>
      </header>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Total</p>
            <p className="text-xl font-bold text-gray-900">{activities.length}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Pendentes</p>
            <p className="text-xl font-bold text-gray-900">{activities.filter((a) => a.status === 'pendente').length}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3 border-l-2 border-l-[#FF1A1A]">
          <div className="p-2 bg-red-50 rounded-lg text-[#FF1A1A]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Ativos</p>
            <p className="text-xl font-bold text-gray-900">{agentes.filter(([_, a]) => (a as Agent).status === 'ocupado').length}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-green-50 rounded-lg text-green-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Concluídas</p>
            <p className="text-xl font-bold text-gray-900">{activities.filter((a) => a.status === 'concluida').length}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="p-2 bg-red-100 rounded-lg text-red-700">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400">Falhas</p>
            <p className="text-xl font-bold text-gray-900">{activities.filter((a) => a.status === 'falhou').length}</p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasLock ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-400"}`}>
            {hasLock ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase font-bold text-gray-400">Trava</p>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold uppercase truncate">{hasLock ? "OCUP" : "LIVRE"}</p>
              {hasLock && (
                <button 
                  onClick={handleResetLock}
                  className="text-[10px] text-red-600 hover:underline font-bold"
                >
                  RESET
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Agentes Section */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#FF1A1A]" />
            Estado dos Agentes
          </h2>
          <div className="space-y-3">
            {agentes.map(([nome, info]) => (
              <div key={nome} className="card p-4 flex justify-between items-center transition-all hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${(info as Agent).status === 'ocupado' ? 'bg-[#FF1A1A] animate-pulse' : 'bg-green-500'}`} />
                  <div>
                    <p className="font-semibold capitalize text-gray-800">{nome}</p>
                    <p className="text-xs text-gray-400">
                      {(info as Agent).especialidade || 'Agente Genérico'} • {(info as Agent).llm || 'Claude 3.5'}
                      {info.status === 'ocupado' && ` • ativo ${formatDistanceToNow(info.ultima_vez)}`}
                    </p>
                  </div>
                </div>
                {info.atividade_atual && (
                  <span className="badge-green text-[10px]">LIDANDO COM #{info.atividade_atual}</span>
                )}
              </div>
            ))}
          </div>

          {hasLock && (
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-900 text-sm">Trava de Sistema Detectada</p>
                <p className="text-amber-700 text-xs mt-1">PID do processo: {status.lockPid}</p>
              </div>
            </div>
          )}
        </div>

        {/* Fila de Atividades Section */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              Fila de Atividades
            </h2>
            <div className="flex gap-1">
              {['todas', 'pendente', 'em_andamento', 'concluida', 'falhou'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    filter === s ? 'bg-[#FF1A1A] text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                  }`}
                >
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
          <div className="card p-0 overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[600px] scroll-smooth">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Atividade</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {activities
                    .slice()
                    .reverse()
                    .filter((atv) => filter === 'todas' || atv.status === filter)
                    .map((atv) => (
                    <tr key={(atv as ActivityItem).id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded">#{(atv as ActivityItem).id}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">{(atv as ActivityItem).titulo}</p>
                          {(atv as ActivityItem).tokens_estimados && (
                            <span className="text-[10px] font-mono text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                              {(atv as ActivityItem).tokens_estimados} tokens
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{(atv as ActivityItem).criado_em.split('T')[0]} • Skill: {(atv as ActivityItem).skill || '-'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          (atv as ActivityItem).status === 'concluida' ? 'bg-green-100 text-green-700' :
                          (atv as ActivityItem).status === 'em_andamento' ? 'bg-blue-100 text-blue-700 animate-pulse' :
                          (atv as ActivityItem).status === 'falhou' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {(atv as ActivityItem).status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 uppercase">
                            {(atv as ActivityItem).responsavel[0]}
                          </div>
                          <span className="text-xs text-gray-700 font-medium capitalize">{(atv as ActivityItem).responsavel}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {activities.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400">
                        Nenhuma atividade registrada na fila.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
