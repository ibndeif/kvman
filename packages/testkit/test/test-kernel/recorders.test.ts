import type { Json, Problem } from '@kvman/protocol';
import { createTestKernel, TestkitProblem, type TestKernel, type TestKernelOptions } from '../../src/index.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const probe = new URL('./fixtures/extensions/probe/extension.ts', import.meta.url);
const asker = new URL('./fixtures/extensions/asker/extension.ts', import.meta.url);

const kernels: TestKernel[] = [];

afterEach(async () => {
  while (kernels.length > 0) await kernels.pop()?.close();
});

async function started(options: TestKernelOptions): Promise<TestKernel> {
  const kernel = await createTestKernel(options);
  kernels.push(kernel);
  return kernel;
}

function problemOf(error: unknown): Problem {
  if (error instanceof TestkitProblem) return error.problem;
  throw new Error(`expected a TestkitProblem, got ${String(error)}`);
}

function field(value: Json, name: string): Json {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const found = value[name];
    if (found !== undefined) return found;
  }
  throw new Error(`expected ${name} in the reply`);
}

function itemsOf(value: Json): Json[] {
  if (Array.isArray(value)) return value;
  throw new Error('expected an array in the reply');
}

function textOf(value: Json, name: string): string {
  const found = field(value, name);
  if (typeof found === 'string') return found;
  throw new Error(`expected ${name} to be a string`);
}

describe('recorders, blobs, and idle (ADR 0165)', { timeout: 60_000 }, () => {
  it('M2.13-E13 committed events record in order and failed units record nothing', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.command('probe.ping', {})).toEqual({});
    const pinged = k.events('probe.pinged');
    expect(pinged).toHaveLength(1);
    expect(pinged[0]).toEqual({ type: 'probe.pinged', payload: { explode: false }, workspaceId: k.workspaceId });
    const noticed = k.events('probe.noticed');
    expect(noticed).toHaveLength(1);
    expect(noticed[0]).toEqual({ type: 'probe.noticed', payload: {}, workspaceId: k.workspaceId });
    expect(k.events().map((event) => event.type)).toEqual(['probe.pinged', 'probe.noticed']);
    const failed = await k.command('probe.ping-fail', {}).catch((error: unknown) => error);
    expect(problemOf(failed).code).toBe('probe/NOPE');
    expect(k.events()).toHaveLength(2);
  });

  it('M2.13-E14 toasts and notifications record with their payloads', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.command('probe.toast', {})).toEqual({});
    const sends = k.ui();
    expect(sends).toHaveLength(2);
    expect(sends[0]).toMatchObject({ type: 'ui.toast', payload: { text: '$t.toast.done' }, workspaceId: k.workspaceId });
    expect(sends[1]).toEqual({ type: 'ui.notify', payload: { title: '$t.toast.done', key: 'k1' }, workspaceId: k.workspaceId });
    expect(k.ui('ui.notify')).toHaveLength(1);
  });

  it('M2.13-E15 an uploaded blob answers its info and reads back its text', async () => {
    const k = await started({ extensions: [probe] });
    const stored = await k.blobs.put(new TextEncoder().encode('hello'), { mime: 'text/plain' });
    expect(stored).toMatchObject({ size: 5, mime: 'text/plain' });
    expect(typeof stored.blobId).toBe('string');
    expect(await k.asUser().command('probe.blob', { blobId: stored.blobId })).toBe('hello');
  });

  it('M2.13-E16 a chained send settles by the time idle resolves', async () => {
    const k = await started({ extensions: [probe] });
    expect(await k.command('probe.chain', { depth: 5 })).toEqual({});
    await k.idle();
    const values = field(await k.query('probe.state.get', {}), 'values');
    expect(field(values, 'reached')).toBe(true);
  });

  it('M2.13-E17 idle resolves while a deferred question is still awaiting', async () => {
    const k = await started({ extensions: [asker] });
    const asked = k.command('asker.ask', { topic: 't1', text: 'Ship it?' });
    await vi.waitFor(() => expect(k.events('asker.question.asked')).toHaveLength(1), { timeout: 10_000 });
    await k.idle();
    const items = itemsOf(field(await k.query('asker.questions.list', {}), 'items'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'open', data: { topic: 't1', text: 'Ship it?' }, openKey: 'topic:t1' });
    const id = textOf(items[0] ?? {}, 'id');
    expect(await k.asUser().command('asker.question.answer', { questionId: id, answer: 'yes' })).toEqual({});
    expect(await asked).toEqual({ answer: 'yes' });
  });
});
