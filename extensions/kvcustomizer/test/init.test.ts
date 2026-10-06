import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runConnector } from '@kvman/kvcoder/testing';
import { describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

const file = readFileSync(fileURLToPath(new URL('../docs/init.md', import.meta.url)), 'utf8');
const inOrder = (text: string, parts: readonly string[]) => parts.map((part) => text.indexOf(part)).every((at, index, all) => at > (all[index - 1] ?? -1));

async function instructions(): Promise<string> {
  const { kernel } = await kvcustomizer.start();
  return (await kernel.exec('kvcustomizer.app.guide.get', {})).instructions;
}

describe("kvman init, the agent's guide for changing the app (09 §9.4, ADR 0023)", { timeout: 30_000 }, () => {
  it('QA35-H2 the kvman connector opens with the trigger, and the prompt shows it', async () => {
    const { kernel } = await kvcustomizer.start();
    const kvman = (await kernel.exec('kvcoder.connector.list', {})).find((connector) => connector.name === 'kvman');
    expect(kvman?.description.startsWith('Call `init` first when the person asks to change, extend, or customize the app itself: what it does, how it looks, its model, or its settings.')).toBe(true);
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    expect(prompt).toContain('- kvman: Call `init` first when the person asks to change, extend, or customize the app itself');
  });

  it('QA35-H3 a prompt holds no text of kvcustomizer but its connector lines', async () => {
    const { kernel } = await kvcustomizer.start();
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt, sections } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    expect(sections.filter((section) => section.owner === '@kvman/kvcustomizer' || section.id === 'guide')).toEqual([]);
    expect(prompt).not.toContain('Build an extension, in this order');
    expect(prompt).not.toContain('Manage the app:');
  });

  it('QA35-H4 init answers the file docs/init.md, as a public query', async () => {
    const { kernel } = await kvcustomizer.start();
    expect(await kernel.exec('kvcustomizer.app.guide.get', {})).toEqual({ instructions: file });
    const own = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcustomizer');
    expect(own?.queries.find((query) => query.name === 'kvcustomizer.app.guide.get')).toMatchObject({ public: true });
  });

  it('QA35-H5 the text has the questions, then the rules, then the method, in order', async () => {
    const text = await instructions();
    expect(inOrder(text, ['Which app?', 'What the person wants.', "A person who isn't a developer.", 'Build an extension, in this order:', 'Improve an extension that exists:', 'Manage the app:'])).toBe(true);
  });

  it('QA35-H6 it tells the agent how to ask', async () => {
    const text = await instructions();
    for (const sentence of [
      'If the request doesn\'t make clear which, ask once with `ask choice`.',
      'If you don\'t know yet, make one `ask text` call',
      'ask only about what is missing: one question per `ask` call, with all the calls in one reply, the options written as outcomes',
      'and your recommended one first.',
      "Don't ask what reading `extensions-list`, `settings-list`, or `preset-get` would answer.",
    ]) expect(text, sentence).toContain(sentence);
  });

  it("QA35-H7 it has the rules for a person who isn't a developer", async () => {
    const text = await instructions();
    for (const sentence of [
      'Never ask them about, or say to them, extensions, namespaces, presets, setting keys, or commands.',
      "Leave those words out of a call's `description` too, since it is the text of the card that asks them",
      'a setting, an extension that is already installed, an extension you build, and a new preset only when they want a different app. If kvman can\'t do it, say so plainly.',
      'give them its address, and call `ask confirm`',
      '`settings-reset` for a setting, `extensions-uninstall` for an extension.',
      'After a change to the extensions, finish it with one `restart` call (below), and say what is still unchecked.',
    ]) expect(text, sentence).toContain(sentence);
  });

  it('QA35-H8 the method is kept, with the build steps in order', async () => {
    const text = await instructions();
    const steps = ['`docs get`', '`ext new`', 'Write it with `fs`', '`ext check`', '`ext test`', '`preview start`', '`preview query-get`', '`preview command-run`', '`kvman extensions-install` with `{"source":"path:notes"}`'];
    expect(inOrder(text.slice(text.indexOf('Build an extension')), steps), 'the build steps are in order').toBe(true);
    for (const sentence of [
      'Each answers `{ ok: true, output }`, or `{ ok: false, problem }` when the call failed.',
      'Add it to this app only when the person asks',
      'read its code and its docs page first',
      'The person is asked before each of these runs, so make one call for one change and say in its description what changes.',
      'which `restart` makes.',
      '`kvcoder.delegate.workers`, `kvcoder.mcp.servers`, `kvcoder.connectors`, and `kvcoder.connectors.disabled`',
      "Use the connectors `kvman`, `ext`, `preset`, `preview`, and `docs` for everything they cover, and `shell` only for the rest. Read and edit a project's files with `fs`.",
    ]) expect(text, sentence).toContain(sentence);
    expect(text.toLowerCase()).not.toContain('kv' + 'dev');
  });

  it('QA36-H14 the guide tells the agent to restart, what to say, and to read health-get for rolledBack', async () => {
    const text = await instructions();
    for (const sentence of [
      'finish it with one `restart` call (below)',
      'Then `restart` applies it.',
      'Make one `restart` call, and say in its description what stops: the chats\' running work, a preview, and any server you started.',
      'Your own turn ends when kvman stops, so say what you are doing in the same reply as the call.',
      'the terminal where kvman runs may ask them to trust a new extension, and that the page may need a reload.',
      'read `health-get`: if it has `rolledBack`, kvman couldn\'t start with the change and put the app back as it was, so say so, say why from its message, and fix the cause.',
    ]) expect(text, sentence).toContain(sentence);
    expect(text).not.toContain("you can't restart it yourself");
  });

  it('QA35-E1 and QA35-E3 init runs at once and changes nothing, and the other commands need no init', async () => {
    const { kernel } = await kvcustomizer.start();
    const state = async () => JSON.stringify([await kernel.exec('kernel.settings.list', {}), await kernel.exec('kernel.preset.get', {})]);
    const before = await state();
    const guide = await runConnector(kernel, { connector: 'kvman', command: 'init' });
    expect(guide.exitCode).toBe(0);
    expect(guide.output).toContain('"instructions": "The person wants something about the app itself.');
    expect(await state()).toBe(before);
    const fresh = await runConnector(kernel, { connector: 'kvman', command: 'settings-list' });
    expect(fresh.exitCode).toBe(0);
  });

  it('QA35-E5 the text says to call init again when it is no longer in view', async () => {
    expect(await instructions()).toContain('If this text is no longer in view later in the chat, call `kvman init` again.');
  });

  it('QA35-E6 the text keeps the secrets rule', async () => {
    expect(await instructions()).toContain('You never read, list, or change a secret, and there is no command that runs an arbitrary command of the app.');
  });

  it('QA35-E7 the text fits the size a section had', async () => {
    expect(Buffer.byteLength(await instructions(), 'utf8')).toBeLessThanOrEqual(16 * 1024);
  });
});
