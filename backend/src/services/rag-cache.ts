import { logger } from '../config/logger';

interface CacheEntry {
  question: string;
  embedding: number[];
  answer: string;
  sources: string[];
  quickReplies: string[];
  ts: number;
}

const SIMILARITY_THRESHOLD = 0.88;
const TTL_MS = 30 * 60 * 1000; // 30 min
const MAX_PER_CAFE = 50;

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class RagCache {
  private store = new Map<string, CacheEntry[]>();
  private cafeNames = new Map<string, string>();

  get(cafeId: string, embedding: number[]): CacheEntry | null {
    const entries = this.store.get(cafeId) ?? [];
    const now = Date.now();

    const fresh = entries.filter((e) => now - e.ts < TTL_MS);
    if (fresh.length !== entries.length) this.store.set(cafeId, fresh);

    let best: CacheEntry | null = null;
    let bestSim = 0;
    let topSim = 0;
    for (const entry of fresh) {
      const sim = cosine(embedding, entry.embedding);
      if (sim > topSim) topSim = sim;
      if (sim > SIMILARITY_THRESHOLD && sim > bestSim) {
        bestSim = sim;
        best = entry;
      }
    }

    const cafeName = this.cafeNames.get(cafeId) ?? cafeId;
    if (best) {
      logger.info('RAG', `cache hit (sim=${bestSim.toFixed(3)}) from: "${best.question}"`, {
        cafe: cafeName,
      });
    } else if (fresh.length > 0) {
      logger.info(
        'RAG',
        `cache miss (best sim=${topSim.toFixed(3)}, threshold=${SIMILARITY_THRESHOLD})`,
        { cafe: cafeName },
      );
    }
    return best;
  }

  set(
    cafeId: string,
    cafeName: string,
    question: string,
    embedding: number[],
    answer: string,
    sources: string[],
    quickReplies: string[],
  ): void {
    this.cafeNames.set(cafeId, cafeName);
    const entries = this.store.get(cafeId) ?? [];
    entries.push({ question, embedding, answer, sources, quickReplies, ts: Date.now() });
    if (entries.length > MAX_PER_CAFE) entries.splice(0, entries.length - MAX_PER_CAFE);
    this.store.set(cafeId, entries);
    logger.info('RAG', `cache stored (${entries.length}/${MAX_PER_CAFE})`, { cafe: cafeName });
  }

  clear(cafeId: string): void {
    this.store.delete(cafeId);
    const cafeName = this.cafeNames.get(cafeId) ?? cafeId;
    logger.info('RAG', 'cache cleared (config updated)', { cafe: cafeName });
  }
}

export const ragCache = new RagCache();
