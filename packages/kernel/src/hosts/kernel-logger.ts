import type { Json, JsonObject } from '@kvman/protocol';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// What the kernel attaches to a line (13 §13.3); never a payload or a config value.
export type LogAttributes = {
  correlationId: string;
  messageId?: string;
  type?: string;
  extension?: string;
  workspaceId?: string;
  attempt?: number;
};

export type LogRecord = { level: LogLevel; message: string; fields: JsonObject; attributes: LogAttributes };

// Where kernel log lines go; M1.8 writes them with Pino to ~/.kvman/logs/kernel.log (ADR 0073).
export interface KernelLogger {
  write(record: LogRecord): void;
}

const redacted = '[redacted]';
const secretFieldName = /password|token|secret|api[-_]?key|authorization/i;
const bearerToken = /\bBearer\s+[^\s"']+/gi;
const urlCredentials = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

export function redactText(text: string): string {
  return text.replace(bearerToken, `Bearer ${redacted}`).replace(urlCredentials, `$1${redacted}@`);
}

function redactValue(value: Json): Json {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object') return redactFields(value);
  return value;
}

// 13 §13.3: known secret fields at any depth, bearer tokens, and credentials in URLs are masked.
export function redactFields(fields: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, secretFieldName.test(name) ? redacted : redactValue(value)]));
}
