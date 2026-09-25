import { pino } from 'pino';
import { redactFields, redactText, type KernelLogger, type LogRecord } from '../hosts/kernel-logger.ts';

export type LogDestination = { write(line: string): void };

// ADR 0073: the kernel logger backed by Pino. Every line is redacted again here, so no caller can skip it (13 §13.3).
export function pinoKernelLogger(destination: LogDestination): KernelLogger {
  const logger = pino({ base: null, formatters: { level: (label) => ({ level: label }) } }, destination);
  return {
    write(record: LogRecord): void {
      logger[record.level]({ ...redactFields(record.fields), ...record.attributes }, redactText(record.message));
    },
  };
}

// Under --foreground the same lines also reach stdout, for service managers (ADR 0096).
export function teeDestination(...destinations: LogDestination[]): LogDestination {
  return {
    write(line: string): void {
      for (const destination of destinations) destination.write(line);
    },
  };
}
