import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { artifactCommand, calls, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

type World = { kernel: TestKernel; fake: FakeOpenAI; sessionId: string };

async function started(): Promise<World> {
  const { kernel, fake } = await kvcoder.start();
  return { kernel, fake, sessionId: await newSession(kernel) };
}

async function turn(world: World, text: string, ...replies: readonly FakeReply[]): Promise<void> {
  for (const reply of replies) world.fake.reply(reply);
  await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text });
  await world.kernel.clock.advance(0);
}

const list = (world: World, sessionId: string) => world.kernel.exec('kvcoder.artifact.list', { sessionId });

const fileSchema = z.object({ name: z.string(), text: z.string() });
const exportSchema = z.object({ artifacts: z.array(z.object({ id: z.string(), title: z.string(), format: z.string(), version: z.number(), content: z.string(), createdAt: z.string(), updatedAt: z.string() })) });

// The public artifact queries, deletion, export, and restarts (08 §8.6, ADR 0009, 175 and 176).
describe('the artifact queries (08 §8.6, ADR 0009, 175 and 176)', { timeout: 30_000 }, () => {
  it("QA6-H8 a subagent's artifact belongs to the chat at its root", async () => {
    const world = await started();
    world.fake.reply(
      calls(`subagent run '{"task":"Review","mode":"fresh"}'`),
      calls(artifactCommand('write', { id: 'review', title: 'Review', content: 'looks good' }), `ask text '{"prompt":"Done?"}'`),
      says('child done'),
      says('parent done'),
    );
    await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text: 'go' });
    await world.kernel.clock.advance(0);
    const childId = String((await turnState(world.kernel, world.sessionId)).turn?.pending[0]?.childSessionId);
    expect(await list(world, world.sessionId)).toMatchObject([{ id: 'review', title: 'Review', format: 'markdown', version: 1, size: 10 }]);
    expect(await list(world, childId)).toEqual(await list(world, world.sessionId));
    const { turn: child } = await turnState(world.kernel, childId);
    await world.kernel.exec('kvcoder.question.answer', { questionId: String(child?.pending[0]?.questionId), answer: { text: 'yes' } });
    await world.kernel.clock.advance(0);
    expect((await turnState(world.kernel, world.sessionId)).turn).toMatchObject({ outcome: 'done' });
  });

  it('QA6-H9 the public queries list and get, and an extension may call both', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'first', title: 'First', content: 'one' })), says('one'));
    await turn(world, 'again', calls(artifactCommand('write', { id: 'second', title: 'Second', format: 'html', content: '<p>two</p>' })), says('two'));
    await turn(world, 'once more', calls(artifactCommand('edit', { id: 'first', edits: [{ oldText: 'one', newText: 'uno' }] })), says('three'));
    const rows = await list(world, world.sessionId);
    expect(rows.map((row) => row.id)).toEqual(['first', 'second']);
    expect(rows).toMatchObject([
      { id: 'first', title: 'First', format: 'markdown', version: 2, size: 3 },
      { id: 'second', title: 'Second', format: 'html', version: 1, size: 10 },
    ]);
    const asExtension = { as: '@test/todo' };
    expect(await world.kernel.exec('kvcoder.artifact.list', { sessionId: world.sessionId }, asExtension)).toEqual(rows);
    expect(await world.kernel.exec('kvcoder.artifact.get', { sessionId: world.sessionId, id: 'first' }, asExtension)).toMatchObject({ id: 'first', title: 'First', format: 'markdown', version: 2, content: 'uno' });
  });

  it("QA6-H11 deleting the chat deletes its artifacts", async () => {
    const world = await started();
    world.fake.reply(
      calls(`subagent run '{"task":"Help","mode":"fresh"}'`),
      calls(artifactCommand('write', { id: 'notes', title: 'Notes', content: 'from the helper' })),
      says('child done'),
      says('parent done'),
    );
    await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text: 'go' });
    await world.kernel.clock.advance(0);
    await turn(world, 'again', calls(artifactCommand('write', { id: 'plan', title: 'Plan', content: 'mine' })), says('five'));
    expect(await list(world, world.sessionId)).toHaveLength(2);
    await world.kernel.exec('kvcoder.session.delete', { sessionId: world.sessionId });
    await world.kernel.clock.advance(0);
    await expect(list(world, world.sessionId)).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
    await expect(world.kernel.exec('kvcoder.artifact.get', { sessionId: world.sessionId, id: 'plan' })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
  });

  it("QA6-H12 export includes artifacts, and fork doesn't copy them", async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'first', title: 'First', content: 'one' })), says('one'));
    await turn(world, 'again', calls(artifactCommand('write', { id: 'second', title: 'Second', format: 'html', content: '<p>two</p>' })), says('two'));
    const { fileId } = await world.kernel.exec('kvcoder.session.export', { sessionId: world.sessionId });
    const file = fileSchema.parse(await world.kernel.exec('todo.file.read', { id: fileId }, { as: '@test/todo' }));
    const data = exportSchema.parse(JSON.parse(file.text));
    expect(data.artifacts.map((artifact) => artifact.id)).toEqual(['first', 'second']);
    expect(data.artifacts[0]).toMatchObject({ id: 'first', title: 'First', format: 'markdown', version: 1, content: 'one' });
    const fork = await world.kernel.exec('kvcoder.session.fork', { sessionId: world.sessionId });
    expect(await list(world, fork.id)).toEqual([]);
  });

  it('QA6-H13 artifacts survive a restart', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Plan', content: 'keep me' })), says('ok'));
    await world.kernel.restart();
    expect(await world.kernel.exec('kvcoder.artifact.get', { sessionId: world.sessionId, id: 'plan' })).toMatchObject({ title: 'Plan', format: 'markdown', version: 1, content: 'keep me' });
    expect(await list(world, world.sessionId)).toHaveLength(1);
  });

  it('QA6-E12 an unknown session or id in the queries fails, and nothing public writes', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Plan', content: 'x' })), says('ok'));
    for (const query of [list(world, 'nope'), world.kernel.exec('kvcoder.artifact.get', { sessionId: 'nope', id: 'plan' })]) {
      await expect(query).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND', params: { sessionId: 'nope' } } });
    }
    await expect(world.kernel.exec('kvcoder.artifact.get', { sessionId: world.sessionId, id: 'missing' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND', params: { id: 'missing' } } });
    const info = (await world.kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcoder');
    expect((info?.commands ?? []).map((command) => command.name)).not.toContain('kvcoder.artifact.write');
  });
});
