import type { TestKernel } from '@kvman/testkit';
import { describe, expect, it } from 'vitest';
import { buildingSession } from './support/kvbuilder-kernel.ts';
import { runs, says, toolResults } from './support/model-script.ts';
import { turn, useScriptedModel } from './support/scripted-world.ts';

const { withModel } = useScriptedModel();

const theme = async (kernel: TestKernel) => (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvwebui.theme');

describe('the kvman connector asks before it changes the app (09 §9.1, ADR 0022, 5)', { timeout: 60_000 }, () => {
  it('QA34-H5 a setting change waits for the person, and is made once allowed', async () => {
    const { kernel, fake } = await withModel();
    const before = await theme(kernel);
    const sessionId = await buildingSession(kernel, 'Theme');
    fake.reply(runs('kvman', 'settings-set', { key: 'kvwebui.theme', value: 'dark', scope: 'global' }), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Use the dark theme' });
    await kernel.clock.advance(0);

    const waiting = await turn(kernel, sessionId);
    expect(waiting.session.status).toBe('waiting');
    expect(waiting.turn?.pending).toEqual([expect.objectContaining({ kind: 'approval', question: { description: 'A walkthrough step.', connector: 'kvman', command: 'settings-set', payload: { key: 'kvwebui.theme', value: 'dark', scope: 'global' } } })]);
    expect(await theme(kernel)).toEqual(before);

    await kernel.exec('kvcoder.question.answer', { questionId: String(waiting.turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(await theme(kernel)).toMatchObject({ value: 'dark', source: 'global' });
    expect((await turn(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });

  it('QA34-H5 a denied change leaves the setting as it was', async () => {
    const { kernel, fake } = await withModel();
    const before = await theme(kernel);
    const sessionId = await buildingSession(kernel, 'Theme');
    fake.reply(runs('kvman', 'settings-set', { key: 'kvwebui.theme', value: 'dark', scope: 'global' }), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Use the dark theme' });
    await kernel.clock.advance(0);
    const waiting = await turn(kernel, sessionId);
    await kernel.exec('kvcoder.question.answer', { questionId: String(waiting.turn?.pending[0]?.questionId), answer: { confirmed: false } });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['denied by the user']);
    expect(await theme(kernel)).toEqual(before);
  });

  it('QA34-E6 the reads never ask', async () => {
    const { kernel, fake } = await withModel();
    const sessionId = await buildingSession(kernel, 'Reads');
    fake.reply(runs('kvman', 'settings-list'), runs('kvman', 'health-get'), runs('kvman', 'query-get', { name: 'kernel.health.get' }), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Look around' });
    await kernel.clock.advance(0);
    expect((await turn(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] });
    expect(toolResults(fake).at(-1)).toContain('"preset"');
  });
});
