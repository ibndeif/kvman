import { describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

describe("kvcustomizer's global guide section (09 §9.4)", { timeout: 30_000 }, () => {
  it('QA17-E21 the section sends the agent to the connectors and to the docs, and file edits to fs', async () => {
    const { kernel } = await kvcustomizer.start();
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    expect(prompt).toContain("Use the connectors `kvman`, `ext`, `preset`, `preview`, and `docs` for everything they cover, and `shell` only for the rest. Read and edit a project's files with `fs`.");
    expect(prompt).toContain('`kvman` changes the app you are running in');
    expect(prompt).toContain('applies at the next start of kvman');
    expect(prompt).toContain('`ext` builds a project in the workspace');
    expect(prompt).toContain('`docs list` shows every page');
    expect(prompt).toContain('`docs get` with `{"topic":"sdk"}` reads a built-in guide, and with `{"extension":"@kvman/kvwebui","topic":"views"}` an extension\'s page.');
    expect(prompt.toLowerCase()).not.toContain('kv' + 'dev');
  });

  it('QA34-H12 the section is a method: building in order, improving what exists, and managing the app', async () => {
    const { kernel } = await kvcustomizer.start();
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt, sections } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    const guide = prompt.slice(prompt.indexOf('## kvman extensions'), prompt.indexOf('## Connectors'));
    const parts = ['Build an extension, in this order:', 'Improve an extension that exists:', 'Manage the app:'];
    expect(parts.map((part) => guide.indexOf(part)).every((at, index, all) => at > (all[index - 1] ?? -1))).toBe(true);
    const steps = ['`docs get`', '`ext new`', 'Write it with `fs`', '`ext check`', '`ext test`', '`preview start`', '`preview query-get`', '`preview command-run`', '`kvman extensions-install` with `{"name":"notes","source":"path:notes"}`'];
    expect(steps.map((step) => guide.indexOf(step)).every((at, index, all) => at > (all[index - 1] ?? -1)), 'the build steps are in order').toBe(true);
    for (const sentence of [
      'Each answers `{ ok: true, output }`, or `{ ok: false, problem }` when the call failed.',
      'Add it to this app only when the person asks',
      'read its code and its docs page first',
      'The person is asked before each of these runs, so make one call for one change and say in its description what changes.',
      "tell the person to restart it; you can't restart it yourself.",
      '`kvcoder.delegate.workers`, `kvcoder.mcp.servers`, `kvcoder.connectors`, and `kvcoder.connectors.disabled`',
      'You never read, list, or change a secret, and there is no command that runs an arbitrary command of the app.',
    ]) expect(guide, sentence).toContain(sentence);
    expect(sections.find((section) => section.id === 'guide')).toMatchObject({ included: true, reach: 'global' });
  });
});
