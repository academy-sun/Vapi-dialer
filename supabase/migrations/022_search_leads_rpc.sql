-- Função RPC para busca de leads com suporte a JSONB (data_json)
-- Evita dependência do cast ::text no filtro OR do PostgREST

CREATE OR REPLACE FUNCTION search_leads(
  p_tenant_id     UUID,
  p_lead_list_id  UUID,
  p_search        TEXT,
  p_limit         INT DEFAULT 50,
  p_offset        INT DEFAULT 0
)
RETURNS SETOF leads
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT *
  FROM leads
  WHERE tenant_id    = p_tenant_id
    AND lead_list_id = p_lead_list_id
    AND (
      phone_e164 ILIKE '%' || p_search || '%'
      OR data_json::text ILIKE '%' || p_search || '%'
    )
  ORDER BY created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- Garante que apenas service role execute (sem acesso anon)
REVOKE ALL ON FUNCTION search_leads(UUID, UUID, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_leads(UUID, UUID, TEXT, INT, INT) TO service_role;
