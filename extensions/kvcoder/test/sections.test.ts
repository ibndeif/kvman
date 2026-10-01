import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const todo = { as: '@test/todo' };

describe('sections (08 §8.4, ADR 0009, 94)', { timeout: 30_000 }, () => {
  it("M2.4-H7 a global section reaches a second workspace's prompt, and a workspace section doesn't", async () => {
    const { kernel, root } = await kvcoder.start();
    await kernel.exec('kvcoder.section.set', { id: 'guide', title: 'Guide', order: 20, global: true, content: 'GLOBAL GUIDE' }, todo);
    await kernel.exec('kvcoder.section.set', { id: 'local', title: 'Local', order: 10, content: 'HOME ONLY' }, todo);
    const other = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(path.join(root, 'other-')) });
    const there = (await kernel.exec('kvcoder.prompt.get', { sessionId: await newSession(kernel, other.id) }, { workspaceId: other.id })).prompt;
    expect(there).toContain('## Guide\nGLOBAL GUIDE');
    expect(there).not.toContain('HOME ONLY');
    const home = (await kernel.exec('kvcoder.prompt.get', { sessionId: await newSession(kernel) })).prompt;
    expect(home.indexOf('## Local\nHOME ONLY')).toBeLessThan(home.indexOf('## Guide\nGLOBAL GUIDE'));
    expect(home.indexOf('## Guide')).toBeGreaterThan(home.indexOf('You are kvman Coder'));
  });

  it('M2.4-E41 caps, places, owners, removal, and a prompt over 64 KB', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const set = (input: { id: string; content: string; order?: number; global?: boolean; sessionId?: string }, as = todo) => kernel.exec('kvcoder.section.set', { title: input.id, order: 0, ...input }, as);
    await expect(set({ id: 'big', content: 'x'.repeat(16 * 1024 + 1) })).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: 16_384 } } });
    await expect(set({ id: 'both', content: 'x', global: true, sessionId })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(set({ id: 'gone', content: 'x', sessionId: 'nope' })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
    for (const index of [1, 2, 3, 4]) await set({ id: `part-${index}`, content: 'p'.repeat(16_000), order: index });
    await expect(set({ id: 'one-more', content: 'x'.repeat(2_000), sessionId })).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: 65_536 } } });
    await set({ id: 'part-1', content: 'small', order: 1, global: false }, { as: '@kvman/kvai' });
    const listed = await kernel.exec('kvcoder.section.list', {});
    expect(listed.filter((section) => section.id === 'part-1').map((section) => section.owner).sort()).toEqual(['@kvman/kvai', '@test/todo']);
    await kernel.exec('kvcoder.section.remove', { id: 'never-set' }, todo);
    await kernel.exec('kvcoder.section.remove', { id: 'part-1' }, { as: '@kvman/kvai' });
    expect((await kernel.exec('kvcoder.section.list', {})).filter((section) => section.id === 'part-1')).toHaveLength(1);

    const elsewhere = await kernel.exec('kernel.workspace.open', { path: mkdtempSync(path.join(tmpdir(), 'kvcoder-other-')) });
    await kernel.exec('kvcoder.section.set', { id: 'late', title: 'Late', order: 100, global: true, content: 'l'.repeat(2_000) }, { ...todo, workspaceId: elsewhere.id });
    const prompt = await kernel.exec('kvcoder.prompt.get', { sessionId });
    expect(prompt.sections.find((section) => section.id === 'late')).toMatchObject({ reach: 'global', included: false, size: 2_000 });
    expect(prompt.prompt).not.toContain('## Late');
    await kernel.exec('kvcoder.section.set', { id: 'gone', title: 'Gone', order: 0, content: 'unloaded owner' }, { as: '@gone/extension', workspaceId: elsewhere.id });
    expect((await kernel.exec('kvcoder.section.list', {}, { workspaceId: elsewhere.id })).map((section) => section.owner)).toEqual(['@test/todo']);
  });
});
