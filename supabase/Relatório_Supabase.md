Relatório Técnico — Diagnóstico de Saúde e Escalabilidade Supabase (Projeto: allrpcrbrpxmzkuxntsy)
Período analisado: últimas 24h
Escopo: Logs de todos os serviços, checagens SQL de conectividade, locks, estatísticas de consultas, padrões de varredura/índices, e conselhos automáticos (Advisors).

Sumário Executivo
Banco operacional, sem locks pendentes ou falhas críticas. Conectividade OK.
Carga intensa e frequente via PostgREST nas tabelas “operacionais” (leads, call_records, dial_queues), com alto volume de consultas curtas e repetitivas, inclusive HEAD/GET/PATCH.
Principais “consumidores de CPU” indicados por estatísticas: consultas do próprio PostgREST contando e paginando leads/call_records e a coleta de metadados do dashboard. Muitas execuções de baixa latência que, somadas, elevam o uso.
Riscos de segurança: RLS desabilitado em tabelas públicas (“assistant_snapshots” e “assistant_configs”).
Riscos de performance: muitos índices duplicados e vários nunca utilizados; 1 FK sem índice de cobertura. Cada índice redundante aumenta custo de escrita e manutenção (autovacuum/reindex), pressionando CPU.
Escalabilidade: padrão de polling/varredura frequente nas filas (leads/dial_queues/call_records) pode gerar consumo elevado e crescimento não linear com aumento de tenants/filas.
Recomendações-chave (prioridade):

Corrigir segurança: habilitar RLS nas tabelas públicas faltantes e definir políticas mínimas.
Higiene de índices: remover duplicados e os “unused” após breve observação; criar cobertura para FK sinalizada.
Otimizar acesso via API: reduzir varreduras repetitivas (HEAD/GET), usar cursos/checkpoints/batching; garantir que filtros tenham índices compostos adequados.
Observabilidade contínua: consolidar monitoria com pg_stat_statements snapshot diário e alertas sobre “top queries” e seq_scans elevados.
Evidências Coletadas
Conectividade e locks
Conexão: OK (SELECT 1 retornou com sucesso).
Long-running queries: nenhuma relevante no momento da amostra.
Locks: nenhum lock não concedido (bloqueio) encontrado.
Estatísticas de consultas (pg_stat_statements)
Top “total time” mostra consultas geradas por:
Dashboard/metadados (varredura de catálogos e policies).
PostgREST em leads e call_records (paginação e contagem).
Config de contexto de requisição do PostgREST, com altíssimo número de calls (163k+), cada uma de custo muito baixo, porém cumulativo.
Principais entradas (amostra top):

PostgREST listagem/paginação em public.leads e public.call_records:
Calls: milhares (2.8k+ cada), mean ~1.7 ms, total ~4.8s cada na janela — indicativo de padrão de polling frequente e distribuído.
Definições de ambiente (set_config…) do PostgREST:
Calls: 163k+, mean ~0.03 ms, total ~4.6s — custo unitário baixo, mas volume muito alto.
Seq scan vs Index scan
leads: idx_scan alto (119k) e seq_scan muito baixo — bom sinal de uso de índices.
call_records: idx_scan alto (52k), seq_scan baixo — bom.
dial_queues e objetos de auth e lead_lists apresentam seq_scans relevantes (mas com pequenas cardinalidades), indicando varreduras frequentes sobre tabelas pequenas (impacto moderado, mas somatório pode custar CPU).
Tamanho do banco
Base de dados “postgres” ~37 MB — pequeno a moderado. O consumo de CPU, portanto, vem mais do padrão de acesso/índices do que de tamanho.
Logs de serviços
API: alto volume de chamadas REST para /rest/v1/leads, /rest/v1/call_records, /rest/v1/dial_queues e HEADs de contagem; códigos 200/204 majoritariamente.
Auth: muitas requisições /user e /token; sem erros relevantes.
Realtime/Edge/Storage: sem erros críticos.
Postgres: conexões normais; sem incidentes.
Advisors (Segurança)
ERRO: RLS desabilitado em:
public.assistant_snapshots
public.assistant_configs
WARN: Função public.set_updated_at com search_path mutável (risco de shadowing).
WARN: Proteção de senhas vazadas (HIBP) desabilitada no Auth.
Advisors (Performance)
FK sem índice de cobertura:
public.tenant_invites: tenant_invites_invited_by_fkey
Muitos índices “unused” reportados em múltiplas tabelas:
leads, lead_lists, call_records, callback_requests, vapi_connections, memberships, dial_queues, tenant_invites, assistant_snapshots
Índices duplicados em várias tabelas:
call_records, callback_requests, dial_queues, lead_lists, leads, memberships, vapi_connections
Auth DB connections “absolutas” (não percentuais): risco de subutilizar recursos ao escalar instância.
Pontos de Atenção e Riscos
Segurança

RLS desabilitado em tabelas expostas (public.assistant_snapshots e public.assistant_configs): risco de vazamento de dados.
Função com search_path mutável: possível execução de objeto inesperado caso seja SECURITY DEFINER.
Performance e CPU

Padrão de polling agressivo (muitas chamadas curtas e repetidas, inclusive HEADs e GETs com contagem/paginação). Em conjunto, isso consome CPU de forma contínua e aumenta sob carga.
Índices duplicados/unused aumentam custo de escrita/manutenção (INSERT/UPDATE/DELETE/ VACUUM/REINDEX), pressionando CPU e I/O.
FK sem índice pode causar varreduras e degradação sob deletes/updates/joins específicos, escalando custo com crescimento.
Escalabilidade

O padrão atual tende a crescer de forma não linear com mais tenants/filas/usuários, pois a aplicação realiza múltiplas varreduras por conjunto de parâmetros.
Sem governança de índices e sem reduzir varreduras, a CPU estourará limites do plano rapidamente em picos (especialmente no free ou instâncias menores).
Recomendações Prioritárias
Segurança (Alta prioridade)
Habilitar RLS:
ALTER TABLE public.assistant_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_configs ENABLE ROW LEVEL SECURITY;
Criar políticas mínimas de SELECT/INSERT/UPDATE/DELETE conforme o modelo de autorização.
Fixar search_path da função public.set_updated_at:
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog, public;
Ativar proteção de senhas vazadas (HIBP) no Auth.
Governança de índices (Alta prioridade)
Remover índices duplicados apontados pelos advisors. Exs.:
call_records: {call_records_tenant_id_dial_queue_id_created_at_idx, call_records_tenant_queue_idx} e {call_records_tenant_id_lead_id_created_at_idx, call_records_tenant_lead_idx} e {call_records_vapi_call_id_idx, call_records_vapi_call_idx, call_records_vapi_id_idx}
leads: {leads_tenant_id_lead_list_id_status_idx, leads_tenant_list_status_idx}, {leads_tenant_id_phone_e164_idx, leads_tenant_phone_idx}, {leads_tenant_id_status_next_attempt_at_idx, leads_tenant_status_next_idx}
dial_queues, lead_lists, memberships, vapi_connections, callback_requests: pares similares.
Validar por 48–72h os índices “unused” (alguns podem ser recentes) e remover os que permanecerem sem uso.
Criar índice para FK sem cobertura:
Em public.tenant_invites, criar índice nas colunas do tenant_invites_invited_by_fkey (ex.: invited_by).
Otimização de acesso via PostgREST (Alta/Média)
Reduzir HEADs/GETs repetidos e próximos no tempo (evitar or mesma consulta de contagem/paginação em alta frequência).
Introduzir “cursor/checkpoint” na aplicação que:
Lê em lotes (LIMIT pequeno já existe; mantenha e avalie aumentar pontualmente).
Evita varrer mesmas condições sem novidade (e.g., usar next_attempt_at e last_seen_id/updated_at).
Consolidar PATCH em batch quando aplicável (via RPC ou UPSERT/UPDATE com filtro de conjunto).
Garantir que os padrões de filtro/sort mais comuns tenham índices compostos alinhados:
leads(tenant_id, lead_list_id, status, next_attempt_at) — se a consulta ordena por next_attempt_at e filtra pelos outros campos.
call_records(tenant_id, created_at) — se há filtros por janela de tempo ou ordenação recente.
Observabilidade contínua (Média)
Formalizar coleta diária de TOP-N queries com pg_stat_statements:
Criar tabela de snapshots e job via pg_cron para armazenar ranking diário (query, calls, mean_time, total_time).
Alertar quando surgirem queries com mean_time alto, total_time crescente, ou seq_scan desproporcional.
Revisar rotinas de aplicação que disparam múltiplas chamadas similares (potenciais N+1).
Usar o painel de Usage na dashboard para acompanhar CPU ao vivo e por período: https://supabase.com/dashboard/org/_/usage._
Manutenção e tuning (Média)
Após limpeza de índices, avaliar bloat e, se necessário, usar pg_repack em janelas de baixa atividade.
Confirmar autovacuum tuning para tabelas de alta write-churn (leads/call_records).
Auth configuração (Baixa/Média)
Alterar estratégia de conexões do Auth para percentual, evitando gargalo ao escalar instância.
Ações Executáveis Propostas (Plano de Trabalho)
Fase 1 — Segurança e Visibilidade (hoje)

Ativar RLS em assistant_snapshots e assistant_configs e implantar políticas mínimas.
Fixar search_path da função set_updated_at.
Habilitar HIBP no Auth.
Implantar job pg_cron para snapshot diário de pg_stat_statements (criação de schema monitor e tabela monitor.top_queries).
Fase 2 — Índices (esta semana)

Listar e remover índices duplicados conforme Advisors.
Observar por 48–72h índices marcados “unused”; remover os que seguirem sem uso.
Criar índice de cobertura para FK em tenant_invites.
Fase 3 — App/API (esta semana)

Ajustar orquestrador para:
Diminuir frequência de HEAD/GET redundantes.
Usar checkpoints/cursors para “pegar apenas novos” registros.
Batching de PATCH/UPDATE quando possível.
Fase 4 — Melhoria Contínua (próximas 2–4 semanas)

Avaliar impacto das mudanças na CPU pelo painel de Usage.
Refinar índices compostos conforme padrão real de consultas observado nos snapshots.
Revisar N+1 e consolidar endpoints críticos.
Impacto Esperado
Redução do consumo de CPU por:
Menos manutenção de índices desnecessários.
Menos varreduras redundantes e sequências de chamadas repetitivas.
Índices compostos bem alinhados aos filtros/sorts, mantendo idx_scan alto e seq_scan baixo.
Mitigação de riscos de segurança com RLS devidamente configurado.
Escalabilidade melhor, com crescimento mais linear do consumo ao aumentar tenants/filas/usuários.
Anexos Técnicos (Resultados de Checagens)
Conectividade: SELECT 1 → OK.
Long-running/ativos: nenhuma relevante; sem bloqueios.
pg_stat_statements (top total time): dominado por consultas PostgREST (leads, call_records) e dashboard; altíssimo volume de set_config.
Seq vs idx scans:
leads: idx_scan 119.120 (excelente), seq_scan 6.
call_records: idx_scan 52.636, seq_scan 3.
dial_queues e tabelas pequenas com seq_scan relevante (impacto somado pelo volume de chamadas).
Tamanho DB: ~37 MB.