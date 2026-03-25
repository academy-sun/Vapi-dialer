-- ============================================================
-- 017_performance_indexes.sql
-- Adicionando índices críticos que estavam faltando em chaves 
-- estrangeiras, o que gera full table scans em cascades / RLS,
-- causando picos intensos de CPU e derrubando queries na auth.users.
--
-- INSTRUÇÃO IMPORTANTE P/ RESOLVER O TIMEOUT:
-- Como a CPU do seu projeto já está em 75%, tentar criar todos de 
-- uma vez derruba a conexão (timeout).
--
-- DICA: SELECIONE (iluminando com o mouse) apenar UM bloco por vez 
-- (da linha CREATE INDEX até o final do nome da tabela) e 
-- clique em RUN para rodar um por um!
-- ============================================================

-- leads -> lead_lists
create index if not exists leads_lead_list_id_idx 
on public.leads(lead_list_id);

-- dial_queues -> lead_lists
create index if not exists dial_queues_lead_list_id_idx 
on public.dial_queues(lead_list_id);

-- call_records -> dial_queues
create index if not exists call_records_dial_queue_id_idx 
on public.call_records(dial_queue_id);

-- call_records -> leads
create index if not exists call_records_lead_id_idx 
on public.call_records(lead_id);

-- callback_requests -> leads
create index if not exists callback_requests_lead_id_idx 
on public.callback_requests(lead_id);

-- callback_requests -> dial_queues
create index if not exists callback_requests_dial_queue_id_idx 
on public.callback_requests(dial_queue_id);

-- Também garantindo um índice direto no tenant_id para todas para RLS
-- (já cobertos parcialmente, mas garantindo índice individual para otimizador)
create index if not exists memberships_tenant_id_pure_idx on public.memberships(tenant_id);
create index if not exists vapi_connections_tenant_id_pure_idx on public.vapi_connections(tenant_id);
create index if not exists lead_lists_tenant_id_pure_idx on public.lead_lists(tenant_id);
create index if not exists leads_tenant_id_pure_idx on public.leads(tenant_id);
create index if not exists dial_queues_tenant_id_pure_idx on public.dial_queues(tenant_id);
create index if not exists call_records_tenant_id_pure_idx on public.call_records(tenant_id);
create index if not exists callback_requests_tenant_id_pure_idx on public.callback_requests(tenant_id);
