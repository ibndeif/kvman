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
});
