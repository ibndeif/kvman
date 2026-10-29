import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

// A lead's long turn is asked where it is every 60 steps, as a message; nothing stops (plan 08 §8.1, ADR 0108, 11).

const kvcoder = useKvcoder();
const checkIn = (step: number): string => `[kvman: step ${String(step)} of this turn. Say in one line where you are and what is left, then go on.]`;

describe('the check-in on a long turn (ADR 0108, 11)', { timeout: 120_000 }, () => {
  it('QA71-H23 step 60 and step 120 get the check-in before their call, and the turn goes on', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(...Array.from({ length: 120 }, () => runs(command('fs', 'list', {}))), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(121);
    const notes = (index: number): string[] => requestMessages(fake, index).filter((message) => message.role === 'user' && textOf(message).startsWith('[kvman: step ')).map(textOf);
    expect(notes(58)).toEqual([]);
    expect(notes(59)).toEqual([checkIn(60)]);
    expect(requestMessages(fake, 59).at(-1)).toMatchObject({ role: 'user' });
    expect(notes(119)).toEqual([checkIn(60), checkIn(120)]);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  });
});
