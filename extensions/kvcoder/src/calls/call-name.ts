import type { Json } from '@kvman/sdk';

// How a call is named where no card shows it (plan 08 §8.5, ADR 0089, 1): `<connector> <command>` and its subject, on
// one line of at most 200 characters, as a card's row cuts it (ADR 0009, 195).

const lineLimit = 200;

/** A JSON object's fields, such as a call's payload. */
export type JsonFields = { readonly [name: string]: Json | undefined };

const text = (value: Json | undefined): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

function joined(separator: string, parts: readonly (string | undefined)[]): string | undefined {
  const given = parts.filter((part) => part !== undefined);
  return given.length === 0 ? undefined : given.join(separator);
}

function mcpTools(payload: JsonFields): string | undefined {
  const steps = payload['steps'];
  if (!Array.isArray(steps)) return text(payload['tool']);
  const tools = steps.flatMap((step) => (typeof step === 'object' && step !== null && !Array.isArray(step) && typeof step['tool'] === 'string' ? [step['tool']] : []));
  return tools.length === 0 ? undefined : tools.join(', ');
}

// The paths `fs read-files` reads (ADR 0097, 1).
function readPaths(payload: JsonFields): string | undefined {
  const files = payload['files'];
  if (!Array.isArray(files)) return undefined;
  return joined(', ', files.map((file) => (typeof file === 'object' && file !== null && !Array.isArray(file) ? text(file['path']) : undefined)));
}

function subjectOf(connector: string, command: string, payload: JsonFields): string | undefined {
  if (command === 'exec') return connector === 'shell' ? text(payload['line']) : joined(' ', [connector, text(payload['args'])]);
  if (command === 'help') return text(payload['command']);
  if (connector === 'fs' && (command === 'search' || command === 'find')) return text(payload['pattern']);
  if (connector === 'fs' && command === 'read-files') return readPaths(payload);
  if (connector === 'delegate' && command === 'run') return joined(' · ', [text(payload['worker']), text(payload['title'])]);
  if (connector === 'mcp') return joined(' · ', [text(payload['server']), mcpTools(payload)]);
  return text(payload['path']) ?? text(payload['id']);
}

function oneLine(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > lineLimit ? `${flat.slice(0, lineLimit)}…` : flat;
}

/** A call named as `<connector> <command>` and its subject: a line, a path, a pattern, a worker, a server's tools, or an id. */
export function callName(connector: string, command: string, payload: JsonFields): string {
  const subject = subjectOf(connector, command, payload);
  return oneLine(subject === undefined ? `${connector} ${command}` : `${connector} ${command} ${subject}`);
}
