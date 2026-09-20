/* eslint-disable no-console */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const currentLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
const currentPriority = LOG_LEVEL_PRIORITY[currentLevel];

const shouldLog = (level: LogLevel) => LOG_LEVEL_PRIORITY[level] <= currentPriority;

const formatTimestamp = () => {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .format(new Date())
    .replace('T', ' ');
};

export const logger = {
  http: (method: string, path: string, status: number, duration: number) => {
    if (!shouldLog('info')) return;
    console.log(`[${formatTimestamp()}] ${method} ${path} ${status} ${duration}ms`);
  },

  server: (message: string) => {
    console.log(`[SERVER] ${message}`);
  },

  database: (message: string, details?: unknown) => {
    if (!shouldLog('debug')) return;
    if (details !== undefined) {
      console.log(`[DATABASE] ${message}`, details);
    } else {
      console.log(`[DATABASE] ${message}`);
    }
  },

  auth: (message: string, details?: unknown) => {
    if (!shouldLog('info')) return;
    if (details !== undefined) {
      console.log(`[AUTH] ${message}`, details);
    } else {
      console.log(`[AUTH] ${message}`);
    }
  },

  debug: (source: string, message: string, data?: unknown) => {
    if (!shouldLog('debug')) return;
    if (data !== undefined) {
      console.log(`[${source}] ${message}`, data);
    } else {
      console.log(`[${source}] ${message}`);
    }
  },

  info: (source: string, message: string, details?: unknown) => {
    if (!shouldLog('info')) return;
    if (details !== undefined) {
      console.log(`[${source}] ${message}`, details);
    } else {
      console.log(`[${source}] ${message}`);
    }
  },

  warn: (source: string, message: string, details?: unknown) => {
    if (!shouldLog('warn')) return;
    if (details !== undefined) {
      console.warn(`[${source}] WARNING: ${message}`, details);
    } else {
      console.warn(`[${source}] WARNING: ${message}`);
    }
  },

  error: (source: string, message: string, details?: unknown) => {
    if (details !== undefined) {
      console.error(`[${source}] ERROR: ${message}`, details);
    } else {
      console.error(`[${source}] ERROR: ${message}`);
    }
  },
};

export default logger;
