-- Migration: Historico de análises com IA do Tenant
-- Criação da tabela para cache das chamadas à OpenAI focadas no Dossiê

CREATE TABLE IF NOT EXISTS public.tenant_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    queue_id UUID REFERENCES public.dial_queues(id) ON DELETE CASCADE, -- opcional, caso analisemos uma campanha específica
    report_type TEXT NOT NULL DEFAULT 'campaign', -- 'campaign' | 'global'
    content TEXT NOT NULL, -- O resultado formatado que a IA mandou (Markdown)
    metadata JSONB, -- Ex: { period_days: 90, sample_size: 50, duration_range: "10-40s" }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.tenant_analyses ENABLE ROW LEVEL SECURITY;

-- Policy de Leitura / Escrita (padrão SaaS multi-tenant)
CREATE POLICY "Tenants can read own analyses" 
    ON public.tenant_analyses FOR SELECT 
    USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id' OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

CREATE POLICY "Tenants can insert own analyses" 
    ON public.tenant_analyses FOR INSERT 
    WITH CHECK (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id' OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role');

-- Index para buscas rápidas no dossiê
CREATE INDEX idx_tenant_analyses_tenant_queue ON public.tenant_analyses(tenant_id, queue_id);
CREATE INDEX idx_tenant_analyses_created_at ON public.tenant_analyses(created_at DESC);
