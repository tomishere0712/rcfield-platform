import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

class MemoryRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  private isExpired(key: string): boolean {
    const item = this.store.get(key);
    if (!item?.expiresAt) return false;
    if (item.expiresAt > Date.now()) return false;
    this.store.delete(key);
    return true;
  }

  async connect(): Promise<void> {
    return undefined;
  }

  async quit(): Promise<void> {
    this.store.clear();
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    if (args.includes('NX') && !this.isExpired(key) && this.store.has(key)) {
      return null;
    }

    const exIndex = args.indexOf('EX');
    const ttlSeconds = exIndex >= 0 ? Number(args[exIndex + 1]) : undefined;
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const current = Number((await this.get(key)) ?? 0) + 1;
    const expiresAt = this.store.get(key)?.expiresAt;
    this.store.set(key, { value: String(current), expiresAt });
    return current;
  }

  async incrby(key: string, count: number): Promise<number> {
    const current = Number((await this.get(key)) ?? 0) + count;
    const expiresAt = this.store.get(key)?.expiresAt;
    this.store.set(key, { value: String(current), expiresAt });
    return current;
  }

  async decrby(key: string, count: number): Promise<number> {
    const current = Number((await this.get(key)) ?? 0) - count;
    const expiresAt = this.store.get(key)?.expiresAt;
    this.store.set(key, { value: String(current), expiresAt });
    return current;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (this.isExpired(key) || !this.store.has(key)) return 0;
    const item = this.store.get(key)!;
    this.store.set(key, { ...item, expiresAt: Date.now() + seconds * 1000 });
    return 1;
  }

  /**
   * Theo đúng quy ước của ioredis: `-2` là khoá không tồn tại, `-1` là khoá tồn
   * tại nhưng không đặt hạn, còn lại là số giây còn lại (làm tròn lên).
   *
   * Thiếu hàm này thì mọi test kiểm hạn sống của một khoá đều đỏ vì `ttl` không
   * phải là hàm — đỏ vì lý do sai, che mất thứ đang thật sự được kiểm.
   */
  async ttl(key: string): Promise<number> {
    if (this.isExpired(key) || !this.store.has(key)) return -2;
    const expiresAt = this.store.get(key)!.expiresAt;
    if (!expiresAt) return -1;
    return Math.ceil((expiresAt - Date.now()) / 1000);
  }

  async del(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    let count = 0;
    for (const key of list) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
    return [...this.store.keys()].filter((key) => !this.isExpired(key) && key.startsWith(prefix));
  }

  on(): this {
    return this;
  }
}

export const redis =
  env.NODE_ENV === 'test'
    ? (new MemoryRedis() as unknown as Redis)
    : new Redis({
        host: env.redis.host,
        port: env.redis.port,
        password: env.redis.password,
        lazyConnect: true,
      });

if (env.NODE_ENV !== 'test') {
  redis.on('error', (err) => {
    logger.error('Redis', 'Connection error', err);
  });
}
