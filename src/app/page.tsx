import Link from "next/link";
import {
  PhoneCall,
  Zap,
  BarChart3,
  ArrowRight,
  MessageSquare,
  Users,
  CheckCircle2,
  Clock,
  TrendingUp,
  Shield,
  Headphones,
  Star,
  Play,
  ChevronRight,
} from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-[Inter,sans-serif]">

      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-xl border-b border-gray-100/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #FF1A1A, #cc0000)" }}>
                <PhoneCall className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-bold tracking-tight text-gray-900">MX3 <span style={{ color: "#FF1A1A" }}>CallX</span></span>
            </div>

            {/* Links */}
            <div className="hidden md:flex items-center gap-8">
              {["Recursos", "Como Funciona", "Preços"].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(" ", "-")}`}
                  className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  {item}
                </a>
              ))}
            </div>

            {/* CTAs */}
            <div className="flex items-center gap-3">
              <Link href="/login" className="hidden sm:block text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors">
                Entrar
              </Link>
              <Link
                href="/app"
                className="btn-primary px-5 py-2 rounded-lg text-sm font-bold shadow-lg"
                style={{ boxShadow: "0 4px 14px rgba(255,26,26,0.3)" }}
              >
                Começar grátis
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-24 overflow-hidden">
        {/* Background gradient blobs */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div
            className="absolute -top-40 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle, #FF1A1A, transparent)" }}
          />
          <div
            className="absolute top-20 right-0 w-[400px] h-[400px] rounded-full opacity-[0.04]"
            style={{ background: "radial-gradient(circle, #FF1A1A, transparent)" }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* Left: Copy */}
            <div>
              {/* Live badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 border border-red-100 mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF1A1A] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF1A1A]" />
                </span>
                <span className="text-xs font-bold text-[#FF1A1A] tracking-wide uppercase">Ligações em andamento agora</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.08] mb-6">
                Automatize suas{" "}
                <span className="relative">
                  <span
                    className="relative z-10"
                    style={{
                      backgroundImage: "linear-gradient(135deg, #FF1A1A 0%, #cc0000 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    ligações
                  </span>
                  <span
                    className="absolute bottom-1 left-0 w-full h-3 opacity-10 rounded"
                    style={{ background: "#FF1A1A" }}
                  />
                </span>{" "}
                com IA de voz.
              </h1>

              <p className="text-lg text-gray-500 leading-relaxed mb-10 max-w-lg">
                Discagem automática com agentes de voz Vapi. Configure, dispare e monitore campanhas inteiras — enquanto sua equipe foca no que importa: fechar negócios.
              </p>

              {/* CTA buttons */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-12">
                <Link
                  href="/app"
                  className="group flex items-center gap-2 btn-primary px-7 py-3.5 rounded-xl text-base font-bold"
                  style={{ boxShadow: "0 8px 24px rgba(255,26,26,0.28)" }}
                >
                  Começar agora — grátis
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <button className="group flex items-center gap-2 px-5 py-3.5 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-colors">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                    <Play className="w-3 h-3 text-gray-700 fill-gray-700 ml-0.5" />
                  </div>
                  Ver demonstração
                </button>
              </div>

              {/* Trust signals */}
              <div className="flex flex-wrap items-center gap-5 text-sm text-gray-400">
                {[
                  { icon: CheckCircle2, text: "Sem cartão de crédito" },
                  { icon: Zap, text: "Setup em 5 minutos" },
                  { icon: Shield, text: "Dados seguros" },
                ].map(({ icon: Icon, text }) => (
                  <span key={text} className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-green-500" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Dashboard mockup (pure CSS) */}
            <div className="relative hidden lg:block">
              {/* Glow behind the card */}
              <div
                className="absolute inset-0 rounded-2xl blur-3xl opacity-15 scale-95"
                style={{ background: "linear-gradient(135deg, #FF1A1A, #ff6666)" }}
              />

              {/* Dashboard card */}
              <div className="relative bg-white rounded-2xl border border-gray-100 shadow-2xl overflow-hidden">
                {/* Dashboard topbar */}
                <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                  </div>
                  <div className="flex items-center gap-2 bg-gray-800 rounded-md px-3 py-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[11px] text-gray-400 font-mono">mx3-callx.vercel.app</span>
                  </div>
                  <div className="w-12" />
                </div>

                {/* Dashboard content */}
                <div className="p-5 bg-gray-50">
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Campanha Ativa</p>
                      <p className="text-sm font-bold text-gray-800">Prospecção B2B — Abril</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      RODANDO
                    </span>
                  </div>

                  {/* Stat cards */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: "Chamadas hoje", value: "1.247", color: "text-gray-900" },
                      { label: "Em ligação", value: "8", color: "text-green-600" },
                      { label: "Taxa de conexão", value: "94%", color: "text-[#FF1A1A]" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                        <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                        <p className={`text-xl font-extrabold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Fake chart bars */}
                  <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm mb-4">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Ligações por hora</p>
                    <div className="flex items-end gap-1.5 h-16">
                      {[35, 55, 42, 80, 65, 90, 70, 95, 85, 75, 60, 88].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm transition-all"
                          style={{
                            height: `${h}%`,
                            background: i === 11
                              ? "linear-gradient(180deg, #FF1A1A, #cc0000)"
                              : i >= 9
                              ? "#fecaca"
                              : "#f3f4f6",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Recent calls */}
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-2 border-b border-gray-50">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Últimas ligações</p>
                    </div>
                    {[
                      { name: "Carlos Mendes", status: "Conectado", time: "agora", ok: true },
                      { name: "Ana Souza", status: "Concluída", time: "2 min", ok: true },
                      { name: "João Lima", status: "Sem resposta", time: "4 min", ok: false },
                    ].map(({ name, status, time, ok }) => (
                      <div key={name} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[9px] font-bold text-gray-500">
                            {name[0]}
                          </div>
                          <p className="text-xs font-medium text-gray-700">{name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold ${ok ? "text-green-600" : "text-gray-400"}`}>{status}</span>
                          <span className="text-[10px] text-gray-300">{time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div
                className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-xl border border-gray-100 px-4 py-3 flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Economizado em SDRs</p>
                  <p className="text-base font-extrabold text-gray-900">R$ 2,1M / mês</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="py-10 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { value: "10.000+", label: "Ligações por dia", icon: PhoneCall },
              { value: "500+", label: "Empresas ativas", icon: Users },
              { value: "94%", label: "Taxa de conexão", icon: TrendingUp },
              { value: "< 5 min", label: "Setup da campanha", icon: Zap },
            ].map(({ value, label, icon: Icon }) => (
              <div key={label} className="text-center">
                <div className="flex justify-center mb-2">
                  <Icon className="w-5 h-5 text-[#FF1A1A]" />
                </div>
                <p className="text-3xl font-extrabold text-white mb-1">{value}</p>
                <p className="text-sm text-gray-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="recursos" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-[#FF1A1A] mb-3">Recursos Poderosos</p>
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">
              Tudo o que você precisa para <br /> escalar suas vendas.
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                color: "bg-red-50 text-[#FF1A1A]",
                title: "Discagem Automática",
                desc: "Algoritmos que otimizam o tempo de espera e conectam leads certos no momento exato. Sem desperdício, sem ociosidade.",
              },
              {
                icon: MessageSquare,
                color: "bg-blue-50 text-blue-600",
                title: "Agentes de Voz Vapi",
                desc: "Integração nativa com Vapi. Crie agentes que atendem, qualificam e transferem chamadas com voz 100% natural.",
              },
              {
                icon: BarChart3,
                color: "bg-green-50 text-green-600",
                title: "Analytics em Tempo Real",
                desc: "Heatmaps por hora e dia, taxa de conversão, custo por lead, motivo de encerramento. Dados para decisão rápida.",
              },
              {
                icon: Users,
                color: "bg-purple-50 text-purple-600",
                title: "Multi-tenant",
                desc: "Gerencie múltiplas equipes e contas em um só lugar. Cada time tem seus próprios leads, campanhas e assistentes.",
              },
              {
                icon: Clock,
                color: "bg-amber-50 text-amber-600",
                title: "Janela de Horários",
                desc: "Defina os dias e horários permitidos para discagem por fuso horário. Conformidade total com regras de cold call.",
              },
              {
                icon: Shield,
                color: "bg-indigo-50 text-indigo-600",
                title: "Segurança Enterprise",
                desc: "API keys criptografadas com AES-256-GCM, RLS no banco de dados, roles granulares (owner, admin, member).",
              },
            ].map(({ icon: Icon, color, title, desc }) => (
              <div
                key={title}
                className="group card p-7 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 hover:border-gray-200"
              >
                <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform`}>
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section id="como-funciona" className="py-24 bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs font-bold uppercase tracking-widest text-[#FF1A1A] mb-3">Simples assim</p>
            <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight">
              Do cadastro à primeira ligação <br /> em menos de 5 minutos.
            </h2>
          </div>

          <div className="relative">
            {/* Connecting line */}
            <div className="absolute top-12 left-1/2 -translate-x-1/2 hidden lg:block w-[calc(100%-8rem)] h-px bg-gray-200" />

            <div className="grid lg:grid-cols-3 gap-8 relative">
              {[
                {
                  step: "01",
                  icon: Users,
                  title: "Importe seus leads",
                  desc: "Faça upload de uma planilha CSV com seus contatos. Validação de número, deduplicação e formatação automática.",
                },
                {
                  step: "02",
                  icon: MessageSquare,
                  title: "Configure o assistente",
                  desc: "Conecte sua API Vapi, escolha o agente de voz, defina o script e ajuste a concorrência de chamadas simultâneas.",
                },
                {
                  step: "03",
                  icon: PhoneCall,
                  title: "Dispare a campanha",
                  desc: "Clique em iniciar. O worker começa a discar respeitando janela de horário e tenta reconectar leads perdidos.",
                },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="flex flex-col items-center text-center relative">
                  <div className="relative z-10 w-24 h-24 rounded-2xl bg-white border border-gray-100 shadow-md flex flex-col items-center justify-center mb-6 group">
                    <span className="text-xs font-bold text-[#FF1A1A] mb-1">{step}</span>
                    <Icon className="w-7 h-7 text-gray-700" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── SOCIAL PROOF ── */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="flex justify-center mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 text-amber-400 fill-amber-400" />
              ))}
            </div>
            <p className="text-lg font-semibold text-gray-700">Avaliado com 4.9/5 por mais de 200 times de vendas</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: "Em 30 dias, a nossa taxa de conexão foi de 41% para 94%. O ROI foi imediato. Nunca mais voltamos para discagem manual.",
                name: "Ricardo Mendes",
                role: "Head de Vendas · FinTech SP",
                initials: "RM",
              },
              {
                quote: "O MX3 CallX substituiu 4 SDRs e multiplicou a capacidade de ligações por 10. O agente Vapi soa mais natural do que esperávamos.",
                name: "Juliana Carvalho",
                role: "CEO · Agência de Cobrança",
                initials: "JC",
              },
              {
                quote: "A parte de analytics com heatmap de horários mudou nossa estratégia de abordagem. Agora discamos só nos momentos de maior pico.",
                name: "Felipe Torres",
                role: "Revenue Ops · SaaS B2B",
                initials: "FT",
              },
            ].map(({ quote, name, role, initials }) => (
              <div key={name} className="card p-7 flex flex-col gap-5">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">&ldquo;{quote}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #FF1A1A, #cc0000)" }}
                  >
                    {initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{name}</p>
                    <p className="text-xs text-gray-400">{role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div
            className="relative rounded-3xl overflow-hidden p-12 lg:p-16 text-center"
            style={{ background: "linear-gradient(135deg, #0f0f0f 0%, #1a0000 50%, #0f0f0f 100%)" }}
          >
            {/* Glow orbs */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 blur-[80px] opacity-40"
              style={{ background: "#FF1A1A" }}
            />
            <div
              className="absolute bottom-0 right-0 w-64 h-64 blur-[100px] opacity-10"
              style={{ background: "#FF1A1A" }}
            />

            <div className="relative z-10">
              <p className="text-xs font-bold uppercase tracking-widest text-[#FF6666] mb-4">Comece hoje</p>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-white mb-5 leading-tight tracking-tight">
                Pronto para escalar <br /> seu time de vendas?
              </h2>
              <p className="text-gray-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
                Crie sua conta agora, importe seus leads e veja o primeiro agente de voz discando em menos de 5 minutos.
              </p>

              <Link
                href="/app"
                className="group inline-flex items-center gap-2 btn-primary px-10 py-4 rounded-2xl text-lg font-bold"
                style={{ boxShadow: "0 8px 32px rgba(255,26,26,0.5)" }}
              >
                Criar conta grátis
                <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>

              <div className="mt-8 flex items-center justify-center flex-wrap gap-6 text-sm text-gray-500">
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" /> Sem cartão de crédito</span>
                <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-green-500" /> Cancele quando quiser</span>
                <span className="flex items-center gap-1.5"><Headphones className="w-4 h-4 text-green-500" /> Suporte em PT-BR</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #FF1A1A, #cc0000)" }}
              >
                <PhoneCall className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-base font-bold text-gray-900">MX3 <span style={{ color: "#FF1A1A" }}>CallX</span></span>
            </div>
            <p className="text-sm text-gray-400">© 2026 MX3 CallX. Todos os direitos reservados.</p>
            <div className="flex gap-6">
              {["Termos", "Privacidade", "Suporte"].map((item) => (
                <a key={item} href="#" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
