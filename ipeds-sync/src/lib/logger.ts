export type Logger = {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

export function createLogger(verbose = false): Logger {
  const emit = (level: string, msg: string, meta?: Record<string, unknown>) => {
    const line = meta ? `${msg} ${JSON.stringify(meta)}` : msg;
    if (level === 'error') console.error(`[${level}] ${line}`);
    else if (level === 'warn') console.warn(`[${level}] ${line}`);
    else if (verbose || level === 'info') console.log(`[${level}] ${line}`);
  };
  return {
    info: (msg, meta) => emit('info', msg, meta),
    warn: (msg, meta) => emit('warn', msg, meta),
    error: (msg, meta) => emit('error', msg, meta),
  };
}
