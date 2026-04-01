-- ============================================================
-- 026_call_records_flat_v2.sql
-- Evolução da call_records_flat → tabela central de consultas
-- Adiciona colunas faltantes, trigger melhorado com alias mapping,
-- RLS para membros, indexes e backfill.
-- SEGURO: apenas ADD COLUMN (non-blocking), DROP/CREATE funções/trigger
-- ============================================================

-- ── 1. Novas colunas ─────────────────────────────────────────────────────────

-- IDs essenciais (FALTAVAM!)
ALTER TABLE public.call_records_flat
  ADD COLUMN IF NOT EXISTS lead_id        UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vapi_call_id   TEXT;

-- Campos de exibição
ALTER TABLE public.call_records_flat
  ADD COLUMN IF NOT EXISTS status           TEXT,
  ADD COLUMN IF NOT EXISTS summary          TEXT,
  ADD COLUMN IF NOT EXISTS recording_url    TEXT,
  ADD COLUMN IF NOT EXISTS machine_detected BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS started_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at         TIMESTAMPTZ;

-- Campos universais normalizados (extraídos de outputs variados)
ALTER TABLE public.call_records_flat
  ADD COLUMN IF NOT EXISTS resumo             TEXT,
  ADD COLUMN IF NOT EXISTS performance_score  SMALLINT,
  ADD COLUMN IF NOT EXISTS success_evaluation BOOLEAN,
  ADD COLUMN IF NOT EXISTS pontos_melhoria    TEXT,
  ADD COLUMN IF NOT EXISTS objecoes           TEXT,
  ADD COLUMN IF NOT EXISTS motivos_falha      TEXT,
  ADD COLUMN IF NOT EXISTS proximo_passo      TEXT;

-- Dados denormalizados do lead (evita JOINs)
ALTER TABLE public.call_records_flat
  ADD COLUMN IF NOT EXISTS lead_phone TEXT,
  ADD COLUMN IF NOT EXISTS lead_name  TEXT;

-- Flags calculados
ALTER TABLE public.call_records_flat
  ADD COLUMN IF NOT EXISTS is_answered   BOOLEAN GENERATED ALWAYS AS (
    ended_reason IN ('customer-ended-call', 'assistant-ended-call')
  ) STORED,
  ADD COLUMN IF NOT EXISTS is_conversion BOOLEAN DEFAULT false;

-- ── 2. Função auxiliar: flatten com normalização de aliases ──────────────────
-- Substitui a versão antiga, agora retorna 2 valores via OUT params

CREATE OR REPLACE FUNCTION public.flatten_structured_outputs_v2(
  so JSONB,
  OUT flat JSONB,
  OUT p_resumo TEXT,
  OUT p_performance_score SMALLINT,
  OUT p_success_evaluation BOOLEAN,
  OUT p_pontos_melhoria TEXT,
  OUT p_objecoes TEXT,
  OUT p_motivos_falha TEXT,
  OUT p_proximo_passo TEXT,
  OUT p_score SMALLINT,
  OUT p_interesse TEXT,
  OUT p_resultado TEXT,
  OUT p_estagio_atingido TEXT,
  OUT p_nivel_engajamento TEXT,
  OUT p_qualidade_tecnica TEXT,
  OUT p_dor_identificada TEXT,
  OUT p_objecao_principal TEXT,
  OUT p_cargo_presumido TEXT,
  OUT p_momento_quebra TEXT,
  OUT p_ponto_de_falha TEXT
)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  key         TEXT;
  val         JSONB;
  result_obj  JSONB;
  raw_score   TEXT;
  raw_perf    TEXT;
BEGIN
  flat := '{}'::JSONB;
  IF so IS NULL THEN RETURN; END IF;

  -- Passo 1: achatar structured_outputs (formato Vapi v2: { assistantId: { result: {...} } })
  FOR key IN SELECT jsonb_object_keys(so) LOOP
    val        := so->key;
    result_obj := val->'result';
    IF result_obj IS NOT NULL AND jsonb_typeof(result_obj) = 'object' THEN
      flat := flat || result_obj;
    ELSIF result_obj IS NOT NULL AND jsonb_typeof(result_obj) != 'object' THEN
      -- result é escalar (ex: boolean, string) — usar name como chave
      flat := flat || jsonb_build_object(COALESCE(val->>'name', key), result_obj);
    END IF;
  END LOOP;

  IF flat = '{}'::JSONB THEN flat := NULL; END IF;
  IF flat IS NULL THEN RETURN; END IF;

  -- Passo 2: Normalização de aliases — mapeia variações → colunas padrão

  -- score (nota 0-100 ou 0-10)
  raw_score := COALESCE(
    flat->>'score',
    flat->>'Score'
  );
  IF raw_score IS NOT NULL AND raw_score ~ '^-?[0-9]+(\.[0-9]*)?$' THEN
    p_score := round(raw_score::NUMERIC)::SMALLINT;
  END IF;

  -- interesse (campo mais universal)
  p_interesse := COALESCE(
    flat->>'interesse',
    flat->>'Interesse',
    flat->>'interesse_em_upsell',
    flat->>'cliente_Interesse'
  );

  -- resultado
  p_resultado := COALESCE(
    flat->>'resultado',
    flat->>'resultado_da_ligacao'
  );

  -- estagio_atingido
  p_estagio_atingido := COALESCE(
    flat->>'estagio_atingido',
    flat->>'estagio atingido'
  );

  -- nivel_engajamento
  p_nivel_engajamento := COALESCE(
    flat->>'nivel_engajamento',
    flat->>'nivel_de_engajamento',
    flat->>'nivel engajamento'
  );
  -- Também checar dentro de perfil_do_lead (Ecotop, JVC)
  IF p_nivel_engajamento IS NULL AND flat->'perfil_do_lead' IS NOT NULL THEN
    p_nivel_engajamento := COALESCE(
      flat->'perfil_do_lead'->>'nivel_de_engajamento',
      flat->'perfil_do_lead'->>'nivel_engajamento',
      flat->'perfil_do_lead'->>'nivel engajamento'
    );
  END IF;

  -- qualidade_tecnica
  p_qualidade_tecnica := COALESCE(
    flat->>'qualidade_tecnica',
    flat->>'qualidade tecnica'
  );

  -- dor_identificada
  p_dor_identificada := COALESCE(
    flat->>'dor_identificada',
    flat->>'dor identificada'
  );
  IF p_dor_identificada IS NULL AND flat->'inteligencia_comercial' IS NOT NULL THEN
    p_dor_identificada := flat->'inteligencia_comercial'->>'dor_identificada';
  END IF;

  -- objecao_principal
  p_objecao_principal := COALESCE(
    flat->>'objecao_principal',
    flat->>'objecao principal',
    flat->>'principal_objecao'
  );
  IF p_objecao_principal IS NULL AND flat->'inteligencia_comercial' IS NOT NULL THEN
    p_objecao_principal := flat->'inteligencia_comercial'->>'principal_objecao';
  END IF;

  -- cargo_presumido
  p_cargo_presumido := COALESCE(
    flat->>'cargo_presumido',
    flat->>'cargo presumido',
    flat->>'cargo_assumido'
  );
  IF p_cargo_presumido IS NULL AND flat->'perfil_do_lead' IS NOT NULL THEN
    p_cargo_presumido := COALESCE(
      flat->'perfil_do_lead'->>'cargo_presumido',
      flat->'perfil_do_lead'->>'cargo_assumido'
    );
  END IF;

  -- momento_quebra
  p_momento_quebra := COALESCE(
    flat->>'momento_quebra',
    flat->>'momento quebra',
    flat->>'momento_de_quebra'
  );
  IF p_momento_quebra IS NULL AND flat->'diagnostico_processo_de_venda' IS NOT NULL THEN
    p_momento_quebra := flat->'diagnostico_processo_de_venda'->>'momento_de_quebra';
  END IF;
  IF p_momento_quebra IS NULL AND flat->'diagnostico_processo_vendas' IS NOT NULL THEN
    p_momento_quebra := flat->'diagnostico_processo_vendas'->>'ponto_de_queda';
  END IF;

  -- ponto_de_falha
  p_ponto_de_falha := COALESCE(
    flat->>'ponto_de_falha',
    flat->>'ponto de falha',
    flat->>'ponto_de_falha_no_roteiro',
    flat->>'ponto_de_falha_do_roteiro'
  );
  IF p_ponto_de_falha IS NULL AND flat->'auditoria_consultiva' IS NOT NULL THEN
    p_ponto_de_falha := flat->'auditoria_consultiva'->>'ponto_de_falha_no_roteiro';
  END IF;
  IF p_ponto_de_falha IS NULL AND flat->'auditoria_mx3' IS NOT NULL THEN
    p_ponto_de_falha := flat->'auditoria_mx3'->>'ponto_de_falha_do_roteiro';
  END IF;

  -- ── Campos NOVOS (universais normalizados) ──

  -- resumo
  p_resumo := COALESCE(
    flat->>'resumo',
    flat->>'Resumo',
    flat->>'resumao'
  );

  -- performance_score (0-100)
  raw_perf := COALESCE(
    flat->>'performance_score_global',
    flat->>'Performance Global Score',
    flat->>'performance_global_score',
    flat->>'Nota_geral',
    flat->>'nota_desempenho_global',
    flat->>'score_global',
    flat->>'global_performance_score'
  );
  IF raw_perf IS NOT NULL AND raw_perf ~ '^-?[0-9]+(\.[0-9]*)?$' THEN
    p_performance_score := round(raw_perf::NUMERIC)::SMALLINT;
  END IF;

  -- success_evaluation (boolean: a call foi sucesso?)
  p_success_evaluation := CASE
    WHEN lower(COALESCE(
      flat->>'success_evaluation',
      flat->>'call_success',
      flat->>'sucesso',
      flat->>'agendamento_realizado'
    )) IN ('sucesso', 'success', 'sim', 'yes', 'true', 'sucesso_parcial') THEN true
    WHEN lower(COALESCE(
      flat->>'success_evaluation',
      flat->>'call_success',
      flat->>'sucesso',
      flat->>'agendamento_realizado'
    )) IN ('fracasso', 'falha', 'failure', 'nao', 'não', 'no', 'false') THEN false
    ELSE NULL
  END;
  -- Checar também resultado booleano direto de "Success Evaluation - Pass/Fail"
  IF p_success_evaluation IS NULL THEN
    -- Percorrer outputs originais buscando result booleano
    FOR key IN SELECT jsonb_object_keys(so) LOOP
      val := so->key;
      IF val->>'name' ILIKE '%Success Evaluation%Pass%Fail%'
         AND jsonb_typeof(val->'result') = 'boolean' THEN
        p_success_evaluation := (val->'result')::BOOLEAN;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- pontos_melhoria
  p_pontos_melhoria := COALESCE(
    flat->>'pontos_melhoria',
    flat->>'Pontos Melhoria',
    flat->>'Pontos_melhoria',
    flat->>'Pontos_Melhoria',
    flat->>'pontos_fortes'  -- fallback para pelo menos algo
  );

  -- objecoes
  p_objecoes := COALESCE(
    flat->>'objecoes',
    flat->>'Lista Objeções',
    flat->>'Lista objeções',
    flat->>'lista_objecoes_resumida',
    flat->>'Lista Objecoes'
  );

  -- motivos_falha
  p_motivos_falha := COALESCE(
    flat->>'motivos_falha',
    flat->>'Possíveis Motivos de Falha',
    flat->>'possiveis_motivos_falha',
    flat->>'Possiveis Motivos de Falha'
  );

  -- proximo_passo
  p_proximo_passo := COALESCE(
    flat->>'proximo_passo',
    flat->>'proximo passo',
    flat->>'Próximo_passo',
    flat->>'Próximos_passos',
    flat->>'next_action'
  );
  IF p_proximo_passo IS NULL AND flat->'diagnostico_processo_de_venda' IS NOT NULL THEN
    p_proximo_passo := flat->'diagnostico_processo_de_venda'->>'proximo_passo_sugerido';
  END IF;
  IF p_proximo_passo IS NULL AND flat->'diagnostico_processo_vendas' IS NOT NULL THEN
    p_proximo_passo := flat->'diagnostico_processo_vendas'->>'proximo_passo_sugerido';
  END IF;

END;
$$;

-- ── 3. Função do trigger (melhorada) ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_flatten_call_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  r RECORD;
  v_lead_phone TEXT;
  v_lead_name  TEXT;
BEGIN
  -- Extrair dados denormalizados do lead
  SELECT l.phone_e164,
         COALESCE(
           l.data_json->>'nome',
           l.data_json->>'name',
           l.data_json->>'Nome',
           l.data_json->>'NOME',
           l.data_json->>'first_name'
         )
  INTO v_lead_phone, v_lead_name
  FROM public.leads l
  WHERE l.id = NEW.lead_id;

  -- Achatar e normalizar structured_outputs
  SELECT * INTO r FROM public.flatten_structured_outputs_v2(NEW.structured_outputs);

  INSERT INTO public.call_records_flat (
    id, tenant_id, dial_queue_id, lead_id, vapi_call_id,
    status, ended_reason, duration_seconds, cost, created_at,
    summary, recording_url, machine_detected, started_at, ended_at,
    -- Campos originais (mantidos)
    score, interesse, resultado, estagio_atingido, nivel_engajamento,
    qualidade_tecnica, dor_identificada, objecao_principal, cargo_presumido,
    momento_quebra, ponto_de_falha,
    -- Campos novos normalizados
    resumo, performance_score, success_evaluation,
    pontos_melhoria, objecoes, motivos_falha, proximo_passo,
    -- Lead denormalizado
    lead_phone, lead_name,
    -- Flags
    is_conversion,
    -- JSONB fallback
    outputs_flat
  ) VALUES (
    NEW.id, NEW.tenant_id, NEW.dial_queue_id, NEW.lead_id, NEW.vapi_call_id,
    NEW.status, NEW.ended_reason, NEW.duration_seconds, NEW.cost, NEW.created_at,
    NEW.summary, NEW.recording_url, COALESCE(NEW.machine_detected, false),
    NEW.started_at, NEW.ended_at,
    -- Campos originais
    r.p_score, r.p_interesse, r.p_resultado, r.p_estagio_atingido,
    r.p_nivel_engajamento, r.p_qualidade_tecnica, r.p_dor_identificada,
    r.p_objecao_principal, r.p_cargo_presumido, r.p_momento_quebra,
    r.p_ponto_de_falha,
    -- Campos novos
    r.p_resumo, r.p_performance_score, r.p_success_evaluation,
    r.p_pontos_melhoria, r.p_objecoes, r.p_motivos_falha, r.p_proximo_passo,
    -- Lead
    v_lead_phone, v_lead_name,
    -- is_conversion: default false, pode ser atualizado com lógica de assistantConfig depois
    COALESCE(r.p_success_evaluation, false),
    -- JSONB
    r.flat
  )
  ON CONFLICT (id) DO UPDATE SET
    lead_id           = EXCLUDED.lead_id,
    vapi_call_id      = EXCLUDED.vapi_call_id,
    status            = EXCLUDED.status,
    ended_reason      = EXCLUDED.ended_reason,
    duration_seconds  = EXCLUDED.duration_seconds,
    cost              = EXCLUDED.cost,
    summary           = EXCLUDED.summary,
    recording_url     = EXCLUDED.recording_url,
    machine_detected  = EXCLUDED.machine_detected,
    started_at        = EXCLUDED.started_at,
    ended_at          = EXCLUDED.ended_at,
    -- Campos originais
    score             = EXCLUDED.score,
    interesse         = EXCLUDED.interesse,
    resultado         = EXCLUDED.resultado,
    estagio_atingido  = EXCLUDED.estagio_atingido,
    nivel_engajamento = EXCLUDED.nivel_engajamento,
    qualidade_tecnica = EXCLUDED.qualidade_tecnica,
    dor_identificada  = EXCLUDED.dor_identificada,
    objecao_principal = EXCLUDED.objecao_principal,
    cargo_presumido   = EXCLUDED.cargo_presumido,
    momento_quebra    = EXCLUDED.momento_quebra,
    ponto_de_falha    = EXCLUDED.ponto_de_falha,
    -- Novos
    resumo            = EXCLUDED.resumo,
    performance_score = EXCLUDED.performance_score,
    success_evaluation= EXCLUDED.success_evaluation,
    pontos_melhoria   = EXCLUDED.pontos_melhoria,
    objecoes          = EXCLUDED.objecoes,
    motivos_falha     = EXCLUDED.motivos_falha,
    proximo_passo     = EXCLUDED.proximo_passo,
    -- Lead
    lead_phone        = EXCLUDED.lead_phone,
    lead_name         = EXCLUDED.lead_name,
    -- Flag
    is_conversion     = EXCLUDED.is_conversion,
    -- JSONB
    outputs_flat      = EXCLUDED.outputs_flat;

  RETURN NEW;
END;
$$;

-- ── 4. Recriar trigger (agora escuta mais colunas) ───────────────────────────

DROP TRIGGER IF EXISTS trg_flatten_call_record ON public.call_records;
CREATE TRIGGER trg_flatten_call_record
  AFTER INSERT OR UPDATE OF
    structured_outputs, ended_reason, duration_seconds, cost,
    status, summary, recording_url, machine_detected,
    started_at, ended_at, lead_id
  ON public.call_records
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_flatten_call_record();

-- ── 5. RLS: adicionar policy para membros do tenant ──────────────────────────

-- Remover policy antiga (só service_role)
DROP POLICY IF EXISTS "Service role full access to call_records_flat" ON public.call_records_flat;

-- Policies novas (mesmo padrão das outras tabelas)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_records_flat'
      AND policyname = 'call_records_flat_select_member'
  ) THEN
    EXECUTE 'CREATE POLICY "call_records_flat_select_member"
      ON public.call_records_flat FOR SELECT
      USING (public.is_member_of_tenant(tenant_id))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'call_records_flat'
      AND policyname = 'call_records_flat_service_role'
  ) THEN
    EXECUTE 'CREATE POLICY "call_records_flat_service_role"
      ON public.call_records_flat FOR ALL
      USING (current_setting(''request.jwt.claims'', true)::json->>''role'' = ''service_role'')
      WITH CHECK (current_setting(''request.jwt.claims'', true)::json->>''role'' = ''service_role'')';
  END IF;
END $$;

-- ── 6. Indexes adicionais ────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_crf_lead_id
  ON public.call_records_flat(lead_id);

CREATE INDEX IF NOT EXISTS idx_crf_vapi_call_id
  ON public.call_records_flat(vapi_call_id);

CREATE INDEX IF NOT EXISTS idx_crf_is_answered
  ON public.call_records_flat(tenant_id, is_answered)
  WHERE is_answered = true;

CREATE INDEX IF NOT EXISTS idx_crf_is_conversion
  ON public.call_records_flat(tenant_id, is_conversion)
  WHERE is_conversion = true;

CREATE INDEX IF NOT EXISTS idx_crf_performance_score
  ON public.call_records_flat(tenant_id, performance_score)
  WHERE performance_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crf_success_eval
  ON public.call_records_flat(tenant_id, success_evaluation)
  WHERE success_evaluation IS NOT NULL;

-- GIN index para queries dinâmicas em outputs_flat
CREATE INDEX IF NOT EXISTS idx_crf_outputs_flat_gin
  ON public.call_records_flat USING GIN (outputs_flat jsonb_path_ops);

-- ── 7. Backfill dos novos campos (dados existentes) ──────────────────────────
-- Usa a nova função flatten_structured_outputs_v2 + dados do lead

-- Batch via CTE — processa tudo de uma vez (50k rows, seguro para Supabase)
WITH src AS (
  SELECT
    cr.id,
    cr.lead_id,
    cr.vapi_call_id,
    cr.status,
    cr.summary,
    cr.recording_url,
    COALESCE(cr.machine_detected, false) AS machine_detected,
    cr.started_at,
    cr.ended_at,
    cr.ended_reason,
    cr.duration_seconds,
    cr.cost,
    cr.created_at,
    cr.tenant_id,
    cr.dial_queue_id,
    l.phone_e164 AS lead_phone,
    COALESCE(
      l.data_json->>'nome',
      l.data_json->>'name',
      l.data_json->>'Nome',
      l.data_json->>'NOME',
      l.data_json->>'first_name'
    ) AS lead_name,
    (public.flatten_structured_outputs_v2(cr.structured_outputs)).*
  FROM public.call_records cr
  LEFT JOIN public.leads l ON l.id = cr.lead_id
)
INSERT INTO public.call_records_flat (
  id, tenant_id, dial_queue_id, lead_id, vapi_call_id,
  status, ended_reason, duration_seconds, cost, created_at,
  summary, recording_url, machine_detected, started_at, ended_at,
  score, interesse, resultado, estagio_atingido, nivel_engajamento,
  qualidade_tecnica, dor_identificada, objecao_principal, cargo_presumido,
  momento_quebra, ponto_de_falha,
  resumo, performance_score, success_evaluation,
  pontos_melhoria, objecoes, motivos_falha, proximo_passo,
  lead_phone, lead_name,
  is_conversion,
  outputs_flat
)
SELECT
  s.id, s.tenant_id, s.dial_queue_id, s.lead_id, s.vapi_call_id,
  s.status, s.ended_reason, s.duration_seconds, s.cost, s.created_at,
  s.summary, s.recording_url, s.machine_detected, s.started_at, s.ended_at,
  s.p_score, s.p_interesse, s.p_resultado, s.p_estagio_atingido,
  s.p_nivel_engajamento, s.p_qualidade_tecnica, s.p_dor_identificada,
  s.p_objecao_principal, s.p_cargo_presumido, s.p_momento_quebra,
  s.p_ponto_de_falha,
  s.p_resumo, s.p_performance_score, s.p_success_evaluation,
  s.p_pontos_melhoria, s.p_objecoes, s.p_motivos_falha, s.p_proximo_passo,
  s.lead_phone, s.lead_name,
  COALESCE(s.p_success_evaluation, false),
  s.flat
FROM src s
ON CONFLICT (id) DO UPDATE SET
  lead_id           = EXCLUDED.lead_id,
  vapi_call_id      = EXCLUDED.vapi_call_id,
  status            = EXCLUDED.status,
  summary           = EXCLUDED.summary,
  recording_url     = EXCLUDED.recording_url,
  machine_detected  = EXCLUDED.machine_detected,
  started_at        = EXCLUDED.started_at,
  ended_at          = EXCLUDED.ended_at,
  ended_reason      = EXCLUDED.ended_reason,
  duration_seconds  = EXCLUDED.duration_seconds,
  cost              = EXCLUDED.cost,
  score             = EXCLUDED.score,
  interesse         = EXCLUDED.interesse,
  resultado         = EXCLUDED.resultado,
  estagio_atingido  = EXCLUDED.estagio_atingido,
  nivel_engajamento = EXCLUDED.nivel_engajamento,
  qualidade_tecnica = EXCLUDED.qualidade_tecnica,
  dor_identificada  = EXCLUDED.dor_identificada,
  objecao_principal = EXCLUDED.objecao_principal,
  cargo_presumido   = EXCLUDED.cargo_presumido,
  momento_quebra    = EXCLUDED.momento_quebra,
  ponto_de_falha    = EXCLUDED.ponto_de_falha,
  resumo            = EXCLUDED.resumo,
  performance_score = EXCLUDED.performance_score,
  success_evaluation= EXCLUDED.success_evaluation,
  pontos_melhoria   = EXCLUDED.pontos_melhoria,
  objecoes          = EXCLUDED.objecoes,
  motivos_falha     = EXCLUDED.motivos_falha,
  proximo_passo     = EXCLUDED.proximo_passo,
  lead_phone        = EXCLUDED.lead_phone,
  lead_name         = EXCLUDED.lead_name,
  is_conversion     = EXCLUDED.is_conversion,
  outputs_flat      = EXCLUDED.outputs_flat;
