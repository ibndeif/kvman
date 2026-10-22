import path from 'node:path';
import { z } from 'zod';
import type { Action } from './session.ts';

// What the view's page sends (plan 15 §15.4, ADR 0100, 29): the frame's own messages (its workspace, and a window, a
// file, a diff, or a Git change to open) and the presses of the extension's buttons. Only an `http:` or `https:`
// address, and only an absolute path, is ever opened (ADR 0099, 23).

const actionSchema = z.enum(['install', 'update', 'start', 'showLog', 'nodejs']);
const absolutePath = z.string().min(1).refine((given) => path.isAbsolute(given), 'an absolute path');

const frameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('kvman.state'), workspaceId: z.string().min(1) }),
  z.object({ kind: z.literal('kvman.open'), url: z.string() }),
  z.object({ kind: z.literal('kvman.openFile'), path: absolutePath, line: z.number().int().min(1).optional() }),
  z.object({ kind: z.literal('kvman.openDiff'), title: z.string().min(1).max(500), path: absolutePath, after: z.string() }),
  z.object({ kind: z.literal('kvman.openChange'), path: absolutePath }),
]);

const pageMessageSchema = z.discriminatedUnion('from', [z.object({ from: z.literal('frame'), data: frameSchema }), z.object({ from: z.literal('page'), action: actionSchema })]);

export type PageMessage =
  | { kind: 'pressed'; action: Action }
  | { kind: 'stated'; workspaceId: string }
  | { kind: 'open'; url: string }
  | { kind: 'openFile'; path: string; line?: number }
  | { kind: 'openDiff'; title: string; path: string; after: string }
  | { kind: 'openChange'; path: string };

function isWebAddress(url: string): boolean {
  return URL.canParse(url) && ['http:', 'https:'].includes(new URL(url).protocol);
}

function frameMessage(data: z.infer<typeof frameSchema>): PageMessage | undefined {
  switch (data.kind) {
    case 'kvman.state':
      return { kind: 'stated', workspaceId: data.workspaceId };
    case 'kvman.open':
      return isWebAddress(data.url) ? { kind: 'open', url: data.url } : undefined;
    case 'kvman.openFile':
      return data.line === undefined ? { kind: 'openFile', path: data.path } : { kind: 'openFile', path: data.path, line: data.line };
    case 'kvman.openDiff':
      return { kind: 'openDiff', title: data.title, path: data.path, after: data.after };
    case 'kvman.openChange':
      return { kind: 'openChange', path: data.path };
  }
}

/** A page message as what to do, or undefined when it is of another shape, names another kind of address, or a relative path. */
export function readPageMessage(message: unknown): PageMessage | undefined {
  const parsed = pageMessageSchema.safeParse(message).data;
  if (parsed === undefined) return undefined;
  return parsed.from === 'page' ? { kind: 'pressed', action: parsed.action } : frameMessage(parsed.data);
}
