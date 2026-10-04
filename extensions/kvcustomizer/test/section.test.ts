import { describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

describe("kvcustomizer's global guide section (09 §9.4)", { timeout: 30_000 }, () => {
  it('QA17-E21 the section sends the agent to the connectors and to the docs, and file edits to fs', async () => {
    const { kernel } = await kvcustomizer.start();
    const session = await kernel.exec('kvcoder.session.create', {});
    const { prompt } = await kernel.exec('kvcoder.prompt.get', { sessionId: session.id });
    expect(prompt).toContain("Use the connectors `ext`, `preset`, `preview`, and `docs` for everything they cover, and the shell only for the rest. Edit a project's files with `fs`.");
    expect(prompt).toContain('`docs list` shows every page');
    expect(prompt).toContain('`docs get \'{"extension":"@kvman/kvwebui","topic":"views"}\'`');
    expect(prompt.toLowerCase()).not.toContain('kv' + 'dev');
  });
});
