import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The guide `/build-kvman` sets as a chat's section (plan 09 §9.4): the file itself, since no query serves it.
const guide = readFileSync(fileURLToPath(new URL('../docs/guide.md', import.meta.url)), 'utf8');
const inOrder = (text: string, parts: readonly string[]) => parts.map((part) => text.indexOf(part)).every((at, index, all) => at > (all[index - 1] ?? -1));

describe("the agent's guide for building kvman (09 §9.4, ADR 0023, 4; ADR 0027, 13)", () => {
  it('QA35-H5 the text has the questions, then the rules, then the method, in order', () => {
    const text = guide;
    expect(inOrder(text, ['Which app?', 'What the person wants.', "A person who isn't a developer.", 'Build an extension, in this order:', 'Improve an extension that exists:', 'Manage the app:'])).toBe(true);
  });

  it('QA35-H6 it tells the agent how to ask', () => {
    const text = guide;
    for (const sentence of [
      'If the request doesn\'t make clear which, ask once with `ask choice`.',
      'If you don\'t know yet, make one `ask text` call',
      'ask only about what is missing: one question per `ask` call, with all the calls in one reply, the options written as outcomes',
      'and your recommended one first.',
      "Don't ask what reading `extensions-list`, `settings-list`, or `preset-get` would answer.",
    ]) expect(text, sentence).toContain(sentence);
  });

  it("QA35-H7 it has the rules for a person who isn't a developer", () => {
    const text = guide;
    for (const sentence of [
      'Never ask them about, or say to them, extensions, namespaces, presets, setting keys, or commands.',
      "Leave those words out of a call's `description` too, since it is the text of the card that asks them",
      'a setting, an extension that is already installed, an extension you build, and a new preset only when they want a different app. If kvman can\'t do it, say so plainly.',
      'give them its address, and call `ask confirm`',
      '`settings-reset` for a setting, `extensions-uninstall` for an extension, `preset-reset` (or `preset-set` with the earlier value) for a value of the app',
      'After a change to the extensions, finish it with one `restart` call (below), and say what is still unchecked.',
    ]) expect(text, sentence).toContain(sentence);
  });

  it('QA35-H8 the method is kept, with the build steps in order', () => {
    const text = guide;
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

  it('QA36-H14 the guide tells the agent to restart, what to say, and to read health-get for rolledBack', () => {
    const text = guide;
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

  it('QA35-E6 the text keeps the secrets rule', () => {
    expect(guide).toContain('You never read, list, or change a secret, and there is no command that runs an arbitrary command of the app.');
  });

  it('QA35-E7 the text fits the size of a section', () => {
    expect(Buffer.byteLength(guide, 'utf8')).toBeLessThanOrEqual(16 * 1024);
  });

  it('QA42-H21 the guide teaches editing this app and the ordered new-preset path', () => {
    expect(inOrder(guide, ["A person who isn't a developer.", 'Installed in this app', 'This app, or a different app.', 'Build an extension, in this order:'])).toBe(true);
    for (const text of ['`preset-set` with `{"key":"kvwebui.home","value":"notes.list"}`', '`preset-reset`', '`kvwebui.title`', '`kvwebui.home`', '`settings-set` instead', 'kvman --preset notes-app']) expect(guide).toContain(text);
    expect(inOrder(guide.slice(guide.indexOf('A different app is a new preset.')), ['`preset new`', 'Edit the file with `fs`', '`preset check`', '`preview start`', '`ask confirm`', '`kvman preset-save`'])).toBe(true);
    expect(guide).toContain('{"extensions":["notes"],"preset":"notes-app.json"}');
  });

  it('QA42-H22 the guide requires conventions and extension pages before writing or changing', () => {
    expect(guide).toContain('the built-in guides (`conventions`, `sdk`, `i18n`, `presets`)');
    expect(guide).toContain("Read `conventions` before you write or change an extension or a preset, the other guides before writing an extension, and an extension's pages before building on it.");
  });

  it('QA42-E22 the guide fits and retains its questions, rules, and method in order', () => {
    expect(Buffer.byteLength(guide, 'utf8')).toBeLessThanOrEqual(16 * 1024);
    expect(inOrder(guide, ['Which app?', 'What the person wants.', "A person who isn't a developer.", 'This app, or a different app.', 'Build an extension, in this order:', 'Improve an extension that exists:', 'Manage the app:'])).toBe(true);
    expect(guide).toContain('Never ask them about, or say to them, extensions, namespaces, presets, setting keys, or commands.');
  });

  it('QA39-E28 the guide never mentions init', () => {
    expect(guide).not.toContain('init');
    expect(guide.startsWith('The person wants something about the app itself.')).toBe(true);
  });

  it('QA51-H1 the guide forbids changing kvman itself, after the rules for a person and before the presets', () => {
    expect(inOrder(guide, ['After a change to the extensions, finish it', 'kvman itself is never changed.', 'This app, or a different app.'])).toBe(true);
    const part = guide.slice(guide.indexOf('kvman itself is never changed.'), guide.indexOf('This app, or a different app.'));
    for (const text of ['`fs` or `shell`', 'every `@kvman/*` package', 'in the global install, in any `node_modules`, or as source checked out in this workspace', '`~/.kvman`', '`KVMAN_HOME`', '`secrets.json`', "a project's `dist/` and `node_modules/`", 'The app changes only through the `kvman` connector.', 'An extension uses only `@kvman/sdk`', 'never imports the kernel', 'there is no workaround: say plainly what can\'t be done']) {
      expect(part, text).toContain(text);
    }
  });

  it('QA51-H2 the guide designs before it builds, from a map of needs to the extensions that serve them', () => {
    expect(inOrder(guide, ['This app, or a different app.', 'Design first.', 'Build an extension, in this order:'])).toBe(true);
    const part = guide.slice(guide.indexOf('Design first.'), guide.indexOf('Build an extension, in this order:'));
    for (const text of ['`<namespace>.ui.get`', '"topic":"views"', '`components`', "`ctx.exec('kvai.complete', …)`", '`models`', '`providers`', '`@kvman/kvcoder` `connectors` and `sections`', 'so your extension depends on `@kvman/kvcoder`', '`ctx.store`', '`ctx.processes`', '`ctx.registerHandler`', '`kvman extensions-get` with `{"name":"@kvman/kvai"}`', 'Put it in the execution map']) {
      expect(part, text).toContain(text);
    }
  });

  it('QA51-H3 the method declares and installs each dependency before writing', () => {
    const steps = ['`docs get`', '`ext new`', '`npm install --save-dev --save-exact <name>@<version>`', 'Write it with `fs`', '`ext check`', '`ext test`', '`preview start`', '`preview query-get`', '`preview command-run`', '`kvman extensions-install`'];
    expect(inOrder(guide.slice(guide.indexOf('Build an extension')), steps)).toBe(true);
    expect(guide).toContain('add `"<name>": "^<version>"` to `kvman.dependencies`');
    expect(guide).toContain('Read `kvman extensions-get` of each extension you will call.');
  });

  it("QA51-H4 a developer's own words may be used back", () => {
    const rule = 'Never ask them about, or say to them, extensions, namespaces, presets, setting keys, or commands.';
    const developer = 'A person who uses these words first is a developer: then you may use them too';
    expect(inOrder(guide, [rule, developer])).toBe(true);
  });

  it('QA51-E1 the guide and a full index fit the sections of a prompt', () => {
    const size = Buffer.byteLength(guide, 'utf8');
    expect(size).toBeLessThanOrEqual(16 * 1024);
    expect(size + 16 * 1024).toBeLessThan(64 * 1024);
  });
});
