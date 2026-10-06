import { runConnector } from '@kvman/kvcoder/testing';
import { describe, expect, it } from 'vitest';
import { runs, says } from './support/model-script.ts';
import { turn, useScriptedModel } from './support/scripted-world.ts';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const { withModel } = useScriptedModel();
const kvcustomizer = useKvcustomizer();

describe('kvman restart (09 §9.1, ADR 0024, 7)', { timeout: 60_000 }, () => {
  it('QA36-H12 kvcustomizer.app.restart runs kernel.restart, and is a public command', async () => {
    const { kernel } = await kvcustomizer.start();
    const requested = kernel.restartRequested().then(() => 'requested');
    expect(await kernel.exec('kvcustomizer.app.restart', {})).toEqual({ restarting: true });
    expect(await requested).toBe('requested');
    const own = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcustomizer');
    expect(own?.commands.find((command) => command.name === 'kvcustomizer.app.restart')).toMatchObject({ public: true });
  });

  it('QA36-H13 a turn that calls kvman restart waits for the person, and nothing restarts until it is allowed', async () => {
    const { kernel, fake } = await withModel();
    const { id: sessionId } = await kernel.exec('kvcoder.session.create', { title: 'Restart' });
    fake.reply(runs('kvman', 'restart'), says('done'));
    let requested = false;
    void kernel.restartRequested().then(() => (requested = true));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Apply the change' });
    await kernel.clock.advance(0);

    const waiting = await turn(kernel, sessionId);
    expect(waiting.session.status).toBe('waiting');
    expect(waiting.turn?.pending).toEqual([expect.objectContaining({ kind: 'approval', question: expect.objectContaining({ connector: 'kvman', command: 'restart', payload: {} }) })]);
    expect(requested).toBe(false);

    await kernel.exec('kvcoder.question.answer', { questionId: String(waiting.turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    await kernel.restartRequested();
    expect(requested).toBe(true);
  });

  it('QA36-E15 help says that the person is asked before kvman restart runs', async () => {
    const { kernel } = await kvcustomizer.start();
    const help = await runConnector(kernel, { connector: 'kvman', command: 'help', payload: { command: 'restart' } });
    expect(help.output).toContain('The person is asked before this runs.');
  });
});
