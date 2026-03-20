/**
 * Rate limiting com sliding window via Redis (ioredis).
 * Fail-open: se o Redis estiver indisponível, a requisição passa normalmente.
 * Sem dependências externas além do ioredis que já está no package.json.
 */
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    redis.on("error", (err) => {
      // Rate limiting não pode derrubar a aplicação — loga e segue
      console.error("[rate-limit] Redis error:", err.message);
    });
  }
  return redis;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Sliding window rate limiter baseado em sorted set do Redis.
 * @param key           Chave única (ex: "rl:wh-leads:listId")
 * @param limit         Máximo de requests permitidos na janela
 * @param windowSeconds Tamanho da janela em segundos
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const r = getRedis();
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Pipeline atômico: remove entradas antigas → conta → adiciona atual → expira
    const pipeline = r.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zcard(key);
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    if (!results) return { allowed: true, remaining: limit, resetInSeconds: windowSeconds };

    const count = (results[1][1] as number) ?? 0;
    const allowed = count < limit;
    const remaining = Math.max(0, limit - count - 1);

    return { allowed, remaining, resetInSeconds: windowSeconds };
  } catch {
    // Se Redis estiver fora, fail-open — não bloqueia o serviço
    return { allowed: true, remaining: limit, resetInSeconds: windowSeconds };
  }
}

// ── Helpers por contexto ────────────────────────────────────────────────────

/** Webhook de entrada de leads: 120 req/min por listId
 *  Generoso para bursts do n8n/Zapier, restritivo para brute-force do secret */
export function rateLimitWebhookLeads(listId: string) {
  return rateLimit(`rl:wh-leads:${listId}`, 120, 60);
}

/** Webhook do Vapi: 300 req/min por tenantId
 *  Vapi envia múltiplos eventos por chamada — janela larga necessária */
export function rateLimitWebhookVapi(tenantId: string) {
  return rateLimit(`rl:wh-vapi:${tenantId}`, 300, 60);
}

/** Import CSV: 10 imports/hora por userId
 *  Operação pesada — limite conservador por usuário autenticado */
export function rateLimitCsvImport(userId: string) {
  return rateLimit(`rl:csv-import:${userId}`, 10, 3600);
}

/** API autenticada geral: 600 req/min por userId
 *  Generoso para não atrapalhar uso normal do frontend */
export function rateLimitApi(userId: string) {
  return rateLimit(`rl:api:${userId}`, 600, 60);
}
