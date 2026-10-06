import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import { childWait } from '../support/api.ts';
import type { KvmanChild } from '../support/kvman-child.ts';
import type { Sandbox } from '../support/sandbox.ts';

// Helpers for the restart tests (plan 02 §2.14, ADR 0024): the lines a restarting kvman prints, and the projects an
// edit installs.

const runningLine = /kvman is running at http:\/\/127\.0\.0\.1:(\d+)\/\?workspace=(\S+)/g;

/** The ports of every `kvman is running at` line kvman printed, in order. */
export function portsOf(child: KvmanChild): number[] {
  return [...child.output().matchAll(runningLine)].map((match) => Number(match[1]));
}

/** Waits for the `count`th `kvman is running at` line, and gives its port. */
export function nthPort(child: KvmanChild, count: number): Promise<number> {
  return vi.waitFor(() => {
    const port = portsOf(child)[count - 1];
    if (port === undefined) throw new Error(`kvman has printed ${String(portsOf(child).length)} running lines, not ${String(count)}.`);
    return port;
  }, childWait);
}

const notesEntry = `
import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  ctx.registerQuery('notes.ping', { description: 'Answers pong.', public: true, input: z.object({}), output: z.object({ text: z.string() }), handle: () => ({ text: 'pong' }) });
};
`;

/** A working project `@test/notes`, in its own folder of the sandbox. */
export function notesProject(world: Sandbox): string {
  return world.writeExtension({ name: '@test/notes', namespace: 'notes', entry: notesEntry });
}

/** A project whose manifest has no `main`, which fails to load with EXTENSION_INVALID. */
export function brokenProject(world: Sandbox): string {
  const folder = world.folder('broken');
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ name: '@test/broken', version: '1.0.0', type: 'module', kvman: { namespace: 'broken' } }));
  return folder;
}
