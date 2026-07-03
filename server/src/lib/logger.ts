type Meta = Record<string, unknown>;

function log(level: 'info' | 'warn' | 'error', event: string, meta: Meta = {}): void {
  process.stdout.write(
    JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...meta }) + '\n'
  );
}

export const logger = {
  info: (event: string, meta?: Meta) => log('info', event, meta),
  warn: (event: string, meta?: Meta) => log('warn', event, meta),
  error: (event: string, meta?: Meta) => log('error', event, meta),
};
