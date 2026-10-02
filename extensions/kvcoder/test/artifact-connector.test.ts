import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { artifactCommand, calls, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

type World = { kernel: TestKernel; fake: FakeOpenAI; sessionId: string; seen: number };

async function started(settings?: Record<string, string>): Promise<World> {
  const { kernel, fake } = await kvcoder.start(settings === undefined ? {} : { settings });
  return { kernel, fake, sessionId: await newSession(kernel), seen: 0 };
}

// A turn of the session: the replies the model gives, then the printed results of its calls in this turn (the model's
// last request holds every earlier turn's results too).
async function turn(world: World, text: string, ...replies: readonly FakeReply[]): Promise<string[]> {
  for (const reply of replies) world.fake.reply(reply);
  await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text });
  await world.kernel.clock.advance(0);
  const all = toolResults(world.fake);
  const fresh = all.slice(world.seen);
  world.seen = all.length;
  return fresh;
}

const json = (text: string): unknown => JSON.parse(text.replace(/\n\[exit code \d+\]$/, ''));

const stored = (world: World, id: string) => world.kernel.exec('kvcoder.artifact.get', { sessionId: world.sessionId, id });

const listed = (world: World) => world.kernel.exec('kvcoder.artifact.list', { sessionId: world.sessionId });

// The model's `artifact` calls through a real turn (08 §8.5, ADR 0009, 173 to 176).
describe('the artifact connector (08 §8.5, ADR 0009, 173 to 176)', { timeout: 30_000 }, () => {
  it('QA6-H1 artifact write creates an artifact', async () => {
    const world = await started();
    const results = await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'The plan', content: 'خطة' })), says('ok'));
    expect(json(results[0] ?? '')).toEqual({ id: 'plan', version: 1, created: true, bytes: 6 });
    expect(results[0]).toMatch(/\n\[exit code 0\]$/);
    expect(await stored(world, 'plan')).toMatchObject({ title: 'The plan', format: 'markdown', content: 'خطة' });
  });

  it('QA6-H2 artifact write replaces an artifact', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Old', content: 'old' })), says('one'));
    const results = await turn(world, 'again', calls(artifactCommand('write', { id: 'plan', title: 'New', format: 'html', content: '<h1>New</h1>' })), says('two'));
    expect(json(results[0] ?? '')).toEqual({ id: 'plan', version: 2, created: false, bytes: 12 });
    expect(await stored(world, 'plan')).toMatchObject({ title: 'New', format: 'html', content: '<h1>New</h1>' });
  });

  it('QA6-H3 artifact edit changes only the named text', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Steps', content: '☐ one\n☐ two\n☐ three\n' })), says('one'));
    const results = await turn(world, 'again', calls(artifactCommand('edit', { id: 'plan', edits: [{ oldText: '☐ two', newText: '☑ two' }] })), says('two'));
    expect(json(results[0] ?? '')).toEqual({ id: 'plan', version: 2, replacements: 1, firstChangedLine: 2 });
    expect(await stored(world, 'plan')).toMatchObject({ title: 'Steps', format: 'markdown', content: '☐ one\n☑ two\n☐ three\n' });
  });

  it('QA6-H4 artifact get reads an artifact', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Steps', content: 'do it' })), says('one'));
    const results = await turn(world, 'again', calls(artifactCommand('get', { id: 'plan' })), says('two'));
    expect(json(results[0] ?? '')).toEqual({ id: 'plan', title: 'Steps', format: 'markdown', version: 1, content: 'do it' });
  });

  it('QA6-H5 the format defaults to Markdown and HTML is accepted', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plain', title: 'Plain', content: 'text' }), artifactCommand('write', { id: 'page', title: 'Page', format: 'html', content: '<p>hi</p>' })), says('ok'));
    expect(await stored(world, 'plain')).toMatchObject({ format: 'markdown' });
    expect(await stored(world, 'page')).toMatchObject({ format: 'html' });
  });

  it('QA6-H6 artifact -h lists the commands', async () => {
    const world = await started();
    const results = await turn(world, 'go', calls('artifact -h'), says('ok'));
    for (const part of ['write', 'edit', 'get', '64 KB', '20 artifacts', 'markdown', 'html', 'network']) expect(results[0] ?? '').toContain(part);
  });

  it('QA6-H7 the JSON may come on stdin', async () => {
    const world = await started();
    const html = `<html><body>${'x'.repeat(5000)}</body></html>`;
    const results = await turn(world, 'go', calls(artifactCommand('write', { id: 'page', title: 'Page', format: 'html', content: html })), says('ok'));
    expect(json(results[0] ?? '')).toEqual({ id: 'page', version: 1, created: true, bytes: 5026 });
    expect(await stored(world, 'page')).toMatchObject({ content: html });
  });

  it("QA6-H10 the tool result carries the card's details", async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'The plan', content: 'first' })), says('one'));
    await turn(world, 'again', calls(artifactCommand('edit', { id: 'plan', edits: [{ oldText: 'first', newText: 'second' }] })), says('two'));
    await turn(world, 'once more', calls(artifactCommand('get', { id: 'plan' })), says('three'));
    const { messages } = await world.kernel.exec('kvcoder.message.list', { sessionId: world.sessionId, limit: 20 });
    const tools = messages.filter((message) => message.kind === 'toolResult');
    expect(tools[0]?.content).toMatchObject({ details: { artifact: { id: 'plan', title: 'The plan', format: 'markdown', version: 1 } }, content: [{ type: 'text', text: expect.stringContaining('"created": true') as unknown }] });
    expect(tools[1]?.content).toMatchObject({ details: { artifact: { id: 'plan', title: 'The plan', format: 'markdown', version: 2 } } });
    expect(tools[2]?.content).not.toHaveProperty('details');
  });

  it('QA6-E1 a bad id fails', async () => {
    const world = await started();
    const write = (id: string) => artifactCommand('write', { id, title: 'Title', content: 'x' });
    const results = await turn(world, 'go', calls(write('Plan'), write('my_plan'), write(''), write('a'.repeat(51))), says('ok'));
    for (const result of results) expect(result).toMatch(/^error VALIDATION_FAILED: .*\n\[exit code 1\]$/);
    expect(await listed(world)).toEqual([]);
  });

  it('QA6-E2 a bad title, format, or shape fails', async () => {
    const world = await started();
    const results = await turn(
      world,
      'go',
      calls(
        artifactCommand('write', { id: 'empty-title', title: '', content: 'x' }),
        artifactCommand('write', { id: 'long-title', title: 't'.repeat(101), content: 'x' }),
        artifactCommand('write', { id: 'bad-format', title: 'Title', format: 'pdf', content: 'x' }),
        artifactCommand('write', { id: 'missing-content', title: 'Title' }),
        artifactCommand('write', { id: 'empty-content', title: 'Title', content: '' }),
        artifactCommand('write', { id: 'extra-key', title: 'Title', content: 'x', mode: 'append' }),
      ),
      says('ok'),
    );
    expect(results).toHaveLength(6);
    for (const result of results) expect(result).toMatch(/^error VALIDATION_FAILED: .*\n\[exit code 1\]$/);
    expect(await listed(world)).toEqual([]);
  });

  it('QA6-E4 the 21st artifact fails, and replacing one of 20 works', async () => {
    const world = await started();
    const ids = Array.from({ length: 20 }, (_, index) => `doc-${index}`);
    const first = await turn(world, 'go', calls(...ids.map((id) => artifactCommand('write', { id, title: id, content: 'x' }))), says('one'));
    expect(first).toHaveLength(20);
    for (const result of first) expect(result).toMatch(/\[exit code 0\]$/);
    const second = await turn(world, 'again', calls(artifactCommand('write', { id: 'doc-20', title: 'Extra', content: 'x' }), artifactCommand('write', { id: 'doc-0', title: 'New', content: 'y' })), says('two'));
    expect(second[0]).toMatch(/^error TOO_LARGE: .*\n\[exit code 1\]$/);
    expect(json(second[1] ?? '')).toEqual({ id: 'doc-0', version: 2, created: false, bytes: 1 });
  });

  it('QA6-E5 an unknown id fails NOT_FOUND', async () => {
    const world = await started();
    const otherId = await newSession(world.kernel);
    await turn({ ...world, sessionId: otherId }, 'go', calls(artifactCommand('write', { id: 'theirs', title: 'Theirs', content: 'x' })), says('ok'));
    const results = await turn(world, 'again', calls(artifactCommand('edit', { id: 'missing', edits: [{ oldText: 'a', newText: 'b' }] }), artifactCommand('get', { id: 'missing' }), artifactCommand('get', { id: 'theirs' })), says('two'));
    for (const result of results) expect(result).toMatch(/^error NOT_FOUND: .*\n\[exit code 1\]$/);
  });

  it('QA6-E6 a failed edit changes nothing', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Plan', content: 'alpha beta\n' })), says('one'));
    const results = await turn(
      world,
      'again',
      calls(
        artifactCommand('edit', { id: 'plan', edits: [{ oldText: 'gamma', newText: 'G' }] }),
        artifactCommand('edit', { id: 'plan', edits: [{ oldText: 'a', newText: 'A' }] }),
        artifactCommand('edit', { id: 'plan', edits: [{ oldText: '', newText: 'G' }] }),
        artifactCommand('edit', { id: 'plan', edits: [{ oldText: 'alpha', newText: 'A' }, { oldText: 'alpha beta', newText: 'AB' }] }),
        artifactCommand('edit', { id: 'plan', edits: [{ oldText: 'alpha', newText: 'alpha' }] }),
      ),
      says('two'),
    );
    expect(results).toHaveLength(5);
    for (const result of results.slice(0, 4)) expect(result).toMatch(/edits\[0\].*\n\[exit code 1\]$/);
    expect(results[4]).toMatch(/change nothing.*\n\[exit code 1\]$/);
    expect(await stored(world, 'plan')).toMatchObject({ version: 1, content: 'alpha beta\n' });
  });

  it('QA6-E7 an edit that would pass 64 KB fails', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'big', title: 'Big', content: `START${'x'.repeat(40_000)}` })), says('one'));
    const results = await turn(world, 'again', calls(artifactCommand('edit', { id: 'big', edits: [{ oldText: 'START', newText: 'y'.repeat(30_000) }] })), says('two'));
    expect(results[0]).toMatch(/^error TOO_LARGE: .*\n\[exit code 1\]$/);
    expect(await stored(world, 'big')).toMatchObject({ version: 1, content: `START${'x'.repeat(40_000)}` });
  });

  it('QA6-E8 two edits of one artifact in one reply both land, in order', async () => {
    const world = await started();
    await turn(world, 'go', calls(artifactCommand('write', { id: 'list', title: 'List', content: 'one\ntwo\nthree\n' })), says('one'));
    const results = await turn(
      world,
      'again',
      calls(artifactCommand('edit', { id: 'list', edits: [{ oldText: 'one', newText: '1' }] }), artifactCommand('edit', { id: 'list', edits: [{ oldText: 'three', newText: '3' }] }), artifactCommand('edit', { id: 'list', edits: [{ oldText: 'two', newText: '2' }] })),
      says('two'),
    );
    for (const result of results) expect(result).toMatch(/\[exit code 0\]$/);
    expect(await stored(world, 'list')).toMatchObject({ version: 4, content: '1\n2\n3\n' });
  });

  it('QA6-E9 a write and a get in one reply run in the model’s order', async () => {
    const world = await started();
    const results = await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Plan', content: 'fresh' }), artifactCommand('get', { id: 'plan' })), says('ok'));
    expect(json(results[0] ?? '')).toMatchObject({ id: 'plan', version: 1, created: true });
    expect(json(results[1] ?? '')).toEqual({ id: 'plan', title: 'Plan', format: 'markdown', version: 1, content: 'fresh' });
  });

  it('QA6-E11 artifact never asks', async () => {
    const world = await started({ 'kvcoder.shell.approval': 'ask' });
    const results = await turn(world, 'go', calls(artifactCommand('write', { id: 'plan', title: 'Plan', content: 'x' })), says('ok'));
    expect((await turnState(world.kernel, world.sessionId)).turn?.pending).toEqual([]);
    expect(json(results[0] ?? '')).toMatchObject({ id: 'plan', created: true });
  });
});
