import { Worker } from 'bullmq';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { redis } from '../config/redis';
import { processEvent } from '../controllers/fb-webhook.controller';
import type { FbChatJobData } from '../queues/fb-chat.queue';

const connection = {
  host: env.redis.host,
  port: env.redis.port,
  ...(env.redis.password && { password: env.redis.password }),
};

const LOCK_TTL_SEC = 30;
const LOCK_POLL_MS = 300;
const LOCK_TIMEOUT_MS = 15_000;

// Ensures messages from the same PSID are processed sequentially.
// Without this, two concurrent jobs for the same user can send replies out of order.
async function withPsidLock<T>(pageId: string, psid: string, fn: () => Promise<T>): Promise<T> {
  const key = `fb:psid-lock:${pageId}:${psid}`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const acquired = await redis.set(key, '1', 'EX', LOCK_TTL_SEC, 'NX');
    if (acquired === 'OK') {
      try {
        return await fn();
      } finally {
        await redis.del(key);
      }
    }
    await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
  }

  throw new Error(`PSID lock timeout: ${pageId}:${psid}`);
}

let fbChatWorker: Worker<FbChatJobData> | null = null;

export function startFbChatWorker(): Worker<FbChatJobData> {
  if (fbChatWorker) return fbChatWorker;

  fbChatWorker = new Worker<FbChatJobData>(
    'fb-chat',
    async (job) => {
      const { event, pageId } = job.data;
      const psid = event.sender.id;
      await withPsidLock(pageId, psid, () => processEvent(event, pageId));
    },
    {
      connection,
      concurrency: 10,
      limiter: { max: 100, duration: 1000 },
    },
  );

  fbChatWorker.on('completed', (job) => {
    logger.info('FbChatWorker', 'job completed', { jobId: job.id });
  });

  fbChatWorker.on('failed', (job, err) => {
    logger.error('FbChatWorker', 'job failed', { jobId: job?.id, error: err.message });
  });

  return fbChatWorker;
}

export async function stopFbChatWorker(): Promise<void> {
  if (!fbChatWorker) return;
  await fbChatWorker.close();
  fbChatWorker = null;
}
