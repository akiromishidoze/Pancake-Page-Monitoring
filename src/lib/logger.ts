import pino from 'pino';

const transport = process.env.NODE_ENV === 'development'
  ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
  : pino.transport({ target: 'pino/file', options: { destination: 1 } });

const root = pino(
  { level: process.env.LOG_LEVEL ?? 'info' },
  transport,
);

export function createLogger(name: string) {
  return root.child({ module: name });
}
