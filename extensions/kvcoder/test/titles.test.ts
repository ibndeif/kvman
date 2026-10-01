import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';

const kvcoder = useKvcoder();

const long = 'Please help me write a function that parses dates written in many formats';

describe('titles (08 §8.1)', { timeout: 30_000 }, () => {
  it('M2.4-E5 the placeholder is the first 60 characters, then kvai writes the title; a renamed session keeps its name; a failed call keeps the placeholder', async () => {
    const { kernel, fake } = await kvcoder.start();
    const titled = (await kernel.exec('kvcoder.session.create', {})).id;
    expect((await kernel.exec('kvcoder.session.get', { sessionId: titled })).title).toBe('');
    fake.reply(says('Sure.'), says('"Date Parsing Helper"'));
    await kernel.exec('kvcoder.message.send', { sessionId: titled, text: long });
    await kernel.clock.advance(0);
    expect(fake.requests().at(-1)?.body).toMatchObject({ max_completion_tokens: 30 });
    expect(fake.requests().at(-1)?.body).not.toHaveProperty('tools');
    expect((await kernel.exec('kvcoder.session.get', { sessionId: titled })).title).toBe('Date Parsing Helper');

    const renamed = (await kernel.exec('kvcoder.session.create', {})).id;
    await kernel.exec('kvcoder.session.rename', { sessionId: renamed, title: 'Mine' });
    fake.reply(says('Sure.'));
    await kernel.exec('kvcoder.message.send', { sessionId: renamed, text: long });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.session.get', { sessionId: renamed })).title).toBe('Mine');
    expect(fake.requests()).toHaveLength(3);

    const failing = (await kernel.exec('kvcoder.session.create', {})).id;
    fake.reply(says('Sure.'), { status: 500, body: { error: { message: 'down', type: 'server_error' } } });
    await kernel.exec('kvcoder.message.send', { sessionId: failing, text: long });
    await kernel.clock.advance(0);
    expect((await kernel.exec('kvcoder.session.get', { sessionId: failing })).title).toBe(long.slice(0, 60));
  });
});
