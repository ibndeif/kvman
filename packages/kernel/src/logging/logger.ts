import { pino, type DestinationStream, type Logger as PinoLogger } from 'pino';
import type { Json } from '@kvman/sdk';

// The kernel's log (plan 01 §1.3). Lines never carry payloads, settings values, or secrets: callers pass only names,
// ids, and counts as fields.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogFields = Readonly<Record<string, Json>>;

export type KernelLogger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

function wrap(logger: PinoLogger): KernelLogger {
  return {
    debug: (message, fields) => logger.debug(fields ?? {}, message),
    info: (message, fields) => logger.info(fields ?? {}, message),
    warn: (message, fields) => logger.warn(fields ?? {}, message),
    error: (message, fields) => logger.error(fields ?? {}, message),
  };
}

export function createKernelLogger(destination: DestinationStream, level: LogLevel): KernelLogger {
  return wrap(pino({ level, base: null }, destination));
}
