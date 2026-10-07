import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { TestKernel } from '@kvman/testkit';
import { describe, expect, it } from 'vitest';
import { useKvbuilder } from './support/kvbuilder-kernel.ts';
import { runs, says, toolResults } from './support/model-script.ts';
import { useScriptedModel } from './support/scripted-world.ts';

const kvbuilder = useKvbuilder();
const { withModel } = useScriptedModel();

const guide = readFileSync(fileURLToPath(new URL('../docs/guide.md', import.meta.url)), 'utf8');
const own = ['kvman', 'ext', 'preset', 'preview', 'docs'];
const start = (kernel: TestKernel, sessionId: string) => kernel.exec('kvbuilder.build.start', { sessionId, argument: '' });
const newSession = async (kernel: TestKernel) => (await kernel.exec('kvcoder.session.create', { title: 'Test' })).id;

// The connector names of a session's prompt index, and the prompt itself.
async function prompted(kernel: TestKernel, sessionId: string) {
  const { prompt, sections } = await kernel.exec('kvcoder.prompt.get', { sessionId });
  const index = (prompt.split('## Connectors\n')[1] ?? '').split('\n').filter((line) => line.startsWith('- ')).map((line) => /^- ([\w-]+): /.exec(line)?.[1]);
  return { prompt, index, sections: sections.filter((section) => section.owner === '@kvman/kvbuilder') };
}

async function expectClean(kernel: TestKernel, sessionId: string): Promise<void> {
  const { prompt, index, sections } = await prompted(kernel, sessionId);
  expect(sections).toEqual([]);
  expect(index.filter((name) => name !== undefined && own.includes(name))).toEqual([]);
  expect(prompt).not.toContain('Build an extension, in this order');
  expect(prompt).not.toContain('Manage the app:');
}

const notes = async (kernel: TestKernel, sessionId: string) =>
  (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.kind === 'note').map((message) => message.content);

describe('/build-kvman: the person starts building kvman in a chat (09 §9.4, ADR 0027)', { timeout: 60_000 }, () => {
  it('QA39-H4 before the command, a chat knows nothing about building kvman', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    await expectClean(kernel, await newSession(kernel));
  });

  it('QA39-H5 kvbuilder.build.start sets the guide, enables the connectors, and adds the note', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const sessionId = await newSession(kernel);
    expect(await start(kernel, sessionId)).toEqual({});
    expect((await kernel.exec('kvcoder.section.list', { sessionId })).filter((section) => section.owner === '@kvman/kvbuilder')).toEqual([
      { id: 'guide', title: 'Building kvman', order: 20, owner: '@kvman/kvbuilder', global: false, sessionId, size: Buffer.byteLength(guide, 'utf8') },
      { id: 'installed', title: 'Installed in this app', order: 21, owner: '@kvman/kvbuilder', global: false, sessionId, size: expect.any(Number) },
    ]);
    const { prompt, index } = await prompted(kernel, sessionId);
    expect(prompt).toContain(guide.trim());
    expect(index.filter((name) => name !== undefined && own.includes(name))).toEqual(own);
    expect(await notes(kernel, sessionId)).toEqual([{ key: 'kvbuilder.build.started' }]);
    const command = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvbuilder')?.commands.find((entry) => entry.name === 'kvbuilder.build.start');
    expect(command).toMatchObject({ public: true });
  });

  it('QA39-E24 a second /build-kvman adds no second note and keeps one guide', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const sessionId = await newSession(kernel);
    await start(kernel, sessionId);
    await start(kernel, sessionId);
    expect(await notes(kernel, sessionId)).toEqual([{ key: 'kvbuilder.build.started' }]);
    expect((await prompted(kernel, sessionId)).sections.map((section) => section.id)).toEqual(['guide', 'installed']);
  });

  it('QA42-H15 build.start sets the installed section after the guide and includes it in the prompt', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const sessionId = await newSession(kernel);
    await start(kernel, sessionId);
    const sections = (await kernel.exec('kvcoder.section.list', { sessionId })).filter((section) => section.owner === '@kvman/kvbuilder');
    expect(sections.map((section) => ({ id: section.id, title: section.title, order: section.order, owner: section.owner, global: section.global, sessionId: section.sessionId }))).toEqual([
      { id: 'guide', title: 'Building kvman', order: 20, owner: '@kvman/kvbuilder', global: false, sessionId },
      { id: 'installed', title: 'Installed in this app', order: 21, owner: '@kvman/kvbuilder', global: false, sessionId },
    ]);
    const { prompt } = await prompted(kernel, sessionId);
    expect(prompt).toContain('Installed in this app');
    expect(prompt).toContain('Preset: ');
    expect(prompt).toContain('- @kvman/kvwebui (kvwebui), ');
    expect(prompt).toContain('  pages: components (Custom components (Vue)), views (Pages and views (kvwebui))');
    expect(prompt).toContain('This is what ran when /build-kvman was typed.');
  });

  it('QA42-H17 running /build-kvman again renews one installed section and adds no note', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const sessionId = await newSession(kernel);
    await start(kernel, sessionId);
    await start(kernel, sessionId);
    const sections = (await kernel.exec('kvcoder.section.list', { sessionId })).filter((section) => section.owner === '@kvman/kvbuilder');
    expect(sections.map((section) => section.id)).toEqual(['guide', 'installed']);
    const prompt = (await prompted(kernel, sessionId)).prompt;
    expect(prompt.split('Preset: ')).toHaveLength(2);
    expect(await notes(kernel, sessionId)).toEqual([{ key: 'kvbuilder.build.started' }]);
  });

  it('QA42-E21 a refused session leaves no installed section', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const valid = await newSession(kernel);
    await expect(start(kernel, 'unknown-session')).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
    expect((await kernel.exec('kvcoder.section.list', { sessionId: valid })).filter((section) => section.owner === '@kvman/kvbuilder')).toEqual([]);
  });

  it('QA39-E25 another chat stays clean', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    const building = await newSession(kernel);
    const other = await newSession(kernel);
    await start(kernel, building);
    await expectClean(kernel, other);
    expect(await notes(kernel, other)).toEqual([]);
  });

  it('QA39-E26 an unknown session fails kvcoder/SESSION_NOT_FOUND', async () => {
    const { kernel } = await kvbuilder.start();
    await kernel.clock.advance(0);
    await expect(start(kernel, 'nope')).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
  });

  it('QA39-E27 the connectors work only in a chat where building is on', async () => {
    const { kernel, fake } = await withModel();
    const sessionId = await newSession(kernel);
    fake.reply(runs('kvman', 'settings-list'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Look' });
    await kernel.clock.advance(0);
    expect(toolResults(fake).at(-1)).toMatch(/^error VALIDATION_FAILED: There is no connector kvman\. The connectors are: /);
    await start(kernel, sessionId);
    fake.reply(runs('kvman', 'settings-list'), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'Look again' });
    await kernel.clock.advance(0);
    expect(toolResults(fake).at(-1)).toContain('"key":"kernel.language"');
  });
});
