-- ============================================================
-- 035_fix_flatten_flat_format.sql
-- Corrige flatten_structured_outputs_v2 para suportar o formato PLANO
-- do Vapi (analysis.structuredData), além do formato com wrapper
-- { id: { result: {...} } } (artifact.structuredOutputs).
--
-- BUG: o Passo 1 só extraía valores de chaves que tinham `.result`.
-- Quando structured_outputs vinha plano (ex: { "interesse": "alto", "score": 8 }),
-- o loop não encontrava `.result`, `flat` ficava vazio → NULL → todas as
-- colunas (interesse, score, resumo, ...) ficavam nulas. Isso esvaziava a
-- coluna de resultado na tela de chamadas e o painel de avaliação no drawer.
--
-- FIX: se nenhum wrapper { result } for encontrado, tratar o próprio
-- structured_outputs como já-plano (fallback flat := so).
--
-- SEGURO: CREATE OR REPLACE FUNCTION + re-backfill idempotente (ON CONFLICT).
-- ============================================================

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

  -- Passo 1b (FIX): nenhum wrapper { result } encontrado → o structured_outputs
  -- já está em formato PLANO (analysis.structuredData do Vapi). Usar como está.
  IF flat = '{}'::JSONB AND jsonb_typeof(so) = 'object' THEN
    flat := so;
  END IF;

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

-- ── Re-backfill: reprocessa registros existentes com a função corrigida ──
-- A trigger só dispara em INSERT/UPDATE de call_records, então registros já
-- gravados em formato plano continuam com colunas nulas até este re-flatten.
UPDATE public.call_records_flat crf
SET
  score             = r.p_score,
  interesse         = r.p_interesse,
  resultado         = r.p_resultado,
  estagio_atingido  = r.p_estagio_atingido,
  nivel_engajamento = r.p_nivel_engajamento,
  qualidade_tecnica = r.p_qualidade_tecnica,
  dor_identificada  = r.p_dor_identificada,
  objecao_principal = r.p_objecao_principal,
  cargo_presumido   = r.p_cargo_presumido,
  momento_quebra    = r.p_momento_quebra,
  ponto_de_falha    = r.p_ponto_de_falha,
  resumo            = r.p_resumo,
  performance_score = r.p_performance_score,
  success_evaluation= r.p_success_evaluation,
  pontos_melhoria   = r.p_pontos_melhoria,
  objecoes          = r.p_objecoes,
  motivos_falha     = r.p_motivos_falha,
  proximo_passo     = r.p_proximo_passo,
  is_conversion     = COALESCE(r.p_success_evaluation, false),
  outputs_flat      = r.flat
FROM public.call_records cr,
     LATERAL public.flatten_structured_outputs_v2(cr.structured_outputs) r
WHERE crf.id = cr.id
  AND cr.structured_outputs IS NOT NULL;
