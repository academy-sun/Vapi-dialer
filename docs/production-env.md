# Variáveis de Ambiente — Produção

Guia completo de todas as variáveis necessárias para rodar o Vapi Dialer em produção.
Nunca commite valores reais. Use o painel de secrets de cada plataforma.

---

## Onde configurar cada variável

| Serviço      | Plataforma | Onde configurar                           |
|--------------|------------|-------------------------------------------|
| Next.js App  | Vercel     | Project → Settings → Environment Variables |
| Worker       | Railway    | Project → Variables                       |
| Ambos        | —          | Devem ter as mesmas variáveis             |

---

## Variáveis obrigatórias

### Supabase

| Variável                      | Onde obter                                             | Exemplo                                      |
|-------------------------------|--------------------------------------------------------|----------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`    | Supabase → Project Settings → API → Project URL        | `https://xyzxyz.supabase.co`                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon key        | `eyJhbGci...`                               |
| `SUPABASE_SERVICE_ROLE_KEY`   | Supabase → Project Settings → API → service_role key  | `eyJhbGci...`                               |

> **Atenção:** `SUPABASE_SERVICE_ROLE_KEY` ignora RLS. Nunca exponha no frontend.
> Usada apenas em API routes server-side e no Worker.

---

### Criptografia

| Variável               | Como gerar                               | Exemplo                                    |
|------------------------|------------------------------------------|--------------------------------------------|
| `ENCRYPTION_KEY_BASE64` | `openssl rand -base64 32` no terminal   | `Wx6thrYOItXVnL749+yo58cTns8RG...`        |

Chave AES-256-GCM de 32 bytes em Base64. Usada para criptografar as chaves da Vapi no banco.

> **Atenção:** Guarde em local seguro. Se perder, as chaves Vapi armazenadas não poderão ser descriptografadas.

---

### Redis (Upstash)

| Variável    | Onde obter                                              | Exemplo                                                     |
|-------------|---------------------------------------------------------|-------------------------------------------------------------|
| `REDIS_URL` | Upstash → Database → REST URL (formato `rediss://...`) | `rediss://default:senha@br1-xyz.upstash.io:6380`           |

> Use o endpoint TLS (`rediss://`) para conexões seguras.

---

### URLs da Aplicação

| Variável       | Valor                             | Onde usar           |
|----------------|-----------------------------------|---------------------|
| `APP_BASE_URL` | URL pública da Vercel             | Webhooks da Vapi    |

Exemplo: `https://meu-projeto.vercel.app`

O webhook da Vapi deve ser configurado como:
```
https://meu-projeto.vercel.app/api/webhooks/vapi/{tenantId}
```

---

## Variáveis opcionais (Worker)

| Variável          | Padrão  | Descrição                                          |
|-------------------|---------|----------------------------------------------------|
| `POLL_INTERVAL_MS` | `5000` | Intervalo do loop de polling em milissegundos       |
| `VAPI_TIMEOUT_MS`  | `15000`| Timeout das chamadas à API da Vapi                  |
| `VAPI_BASE_URL`    | `https://api.vapi.ai` | URL base da Vapi (não alterar em prod) |

---

## Checklist de Deploy

### 1. Supabase
- [ ] Rodar migration: `supabase/migrations/001_initial.sql`
- [ ] Habilitar Auth → Email provider
- [ ] Confirmar que RLS está ativo em todas as tabelas

### 2. Upstash
- [ ] Criar banco Redis na região mais próxima (ex: São Paulo)
- [ ] Copiar a URL `rediss://` para `REDIS_URL`

### 3. Vercel (Next.js App)
- [ ] Conectar repositório
- [ ] Configurar todas as variáveis de ambiente listadas acima
- [ ] Deploy → verificar que a rota `/api/webhooks/vapi/[tenantId]` responde
- [ ] Configurar URL do webhook no painel da Vapi

### 4. Railway (Worker)
- [ ] Criar novo serviço → apontar para o mesmo repositório
- [ ] Configurar **Start Command**: `npm run worker:prod`
- [ ] Configurar todas as variáveis de ambiente (as mesmas do Vercel)
- [ ] Deploy → verificar logs: `✓ Conexão com Supabase OK`

---

## Validação pós-deploy

1. **Login**: Acessar a URL da Vercel e fazer login com Supabase Auth
2. **Criar tenant e configurar chave Vapi**: Verificar que a chave é salva (criptografada)
3. **Importar CSV**: Subir uma lista de teste com 5 leads
4. **Criar fila e iniciar**: Verificar nos logs do Railway que o Worker processa os leads
5. **Webhook**: Verificar se `call_records` são criados e o status dos leads atualiza após a chamada

---

## Segurança

- Rotacionar `ENCRYPTION_KEY_BASE64` exige re-cadastrar todas as chaves Vapi
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve aparecer em logs ou no frontend
- Adicionar `VAPI_WEBHOOK_SECRET` quando a Vapi suportar assinatura HMAC
