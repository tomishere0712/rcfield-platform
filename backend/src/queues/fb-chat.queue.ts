import { Queue } from 'bullmq';
import { env } from '../config/env';
import type { FbMessagingEvent } from '../types';

export interface FbChatJobData {
  event: FbMessagingEvent;
  pageId: string;
}

const connection = {
  host: env.redis.host,
  port: env.redis.port,
  ...(env.redis.password && { password: env.redis.password }),
};

let fbChatQueue: Queue<FbChatJobData> | null = null;

export function getFbChatQueue(): Queue<FbChatJobData> {
  if (!fbChatQueue) {
    fbChatQueue = new Queue<FbChatJobData>('fb-chat', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    });
  }

  return fbChatQueue;
}
