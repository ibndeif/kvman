import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { rawCall, requestMessages, requestTools, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('a chat that holds calls of the old shell tool (08 §8.3, ADR 0011, 12)', { timeout: 30_000 }, () => {
  it('QA18-E21 the old call and its result are sent unchanged, and the one tool offered is run', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(rawCall('bash', { command: 'ls -a' }), says('first'), says('second'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go on' });
    await kernel.clock.advance(0);
    const sent = JSON.stringify(requestMessages(fake));
    expect(sent).toContain('"name":"bash"');
    expect(sent).toContain('ls -a');
    expect(sent).toContain('the tool is run, not bash.');
    expect(requestTools(fake).map((tool) => z.object({ function: z.object({ name: z.string() }) }).parse(tool).function.name)).toEqual(['run']);
  });
});
