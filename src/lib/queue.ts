import { Queue } from "bullmq";
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// ── Singleton Redis ──────────────────────────────────────────────────────────
let redisConnection: Redis | null = null;

export function getRedis(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  }
  return redisConnection;
}

// ── Fila global (legado — mantida para compatibilidade) ──────────────────────
export const DIAL_QUEUE_NAME = "dial-jobs";

let dialQueue: Queue | null = null;

export function getDialQueue(): Queue {
  if (!dialQueue) {
    dialQueue = new Queue(DIAL_QUEUE_NAME, {
      connection: getRedis() as any,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return dialQueue;
}

// ── Filas por tenant (isolamento: uma fila por empresa) ──────────────────────
// Cada tenant tem sua própria fila BullMQ para evitar head-of-line blocking
// entre empresas diferentes disputando a mesma fila global.
const tenantQueues = new Map<string, Queue>();

export function getQueueForTenant(tenantId: string): Queue {
  if (!tenantQueues.has(tenantId)) {
    const queue = new Queue(`dial-jobs-${tenantId}`, {
      connection: getRedis() as any,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 500 },
        removeOnFail:     { count: 200 },
      },
    });
    tenantQueues.set(tenantId, queue);
  }
  return tenantQueues.get(tenantId)!;
}

// Fechar todas as conexões graciosamente (uso em shutdown do worker)
export async function closeAllQueues(): Promise<void> {
  const closes: Promise<void>[] = [];
  for (const queue of tenantQueues.values()) closes.push(queue.close());
  if (dialQueue) closes.push(dialQueue.close());
  await Promise.allSettled(closes);
  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }
}
