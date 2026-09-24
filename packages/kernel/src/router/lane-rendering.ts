import { parseLaneTemplate, type Json, type Message } from '@kvman/protocol';
import { invalid, type Refusal } from './refusal.ts';

export type LaneSource = Pick<Message, 'id' | 'source' | 'workspaceId' | 'payload' | 'context'>;

type PathValue = { present: false } | { present: true; value: Json };

function member(value: Json | undefined, key: string): Json | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value[key];
}

function valueAt(source: LaneSource, path: string): PathValue {
  const [root, ...segments] = path.split('.');
  let value: Json | undefined;
  if (root === '$payload') value = segments.reduce<Json | undefined>((current, key) => member(current, key), source.payload);
  else if (root === '$context') value = source.context[segments[0] ?? ''];
  else if (path === '$message.id') value = source.id;
  else if (path === '$message.source') value = source.source;
  else value = source.workspaceId;
  return value === undefined ? { present: false } : { present: true, value };
}

export type LaneRendering = { ok: true; lane: string } | { ok: false; refusal: Refusal };

// Renders a lane template without running extension code (02 §2.6): an absent path renders as "-", every path
// absent is refused, and a value that is not a string or a number is refused (ADR 0058).
export function renderLane(template: string, source: LaneSource, path: string): LaneRendering {
  const parse = parseLaneTemplate(template);
  if (!parse.ok) return { ok: false, refusal: invalid(path, parse.message) };
  let present = 0;
  const pieces: string[] = [];
  for (const part of parse.parts) {
    if ('literal' in part) {
      pieces.push(part.literal);
      continue;
    }
    const found = valueAt(source, part.path);
    if (!found.present) {
      pieces.push('-');
    } else if (typeof found.value === 'string' || typeof found.value === 'number') {
      present += 1;
      pieces.push(String(found.value));
    } else {
      return { ok: false, refusal: invalid(path, `${part.path} is not a string or a number`) };
    }
  }
  if (present === 0) return { ok: false, refusal: invalid(path, 'none of the lane template paths is present', `lane template: ${template}`) };
  return { ok: true, lane: pieces.join('') };
}
