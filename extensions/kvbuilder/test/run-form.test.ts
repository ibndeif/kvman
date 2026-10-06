import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runConnector } from '@kvman/kvcoder/testing';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();

const page = (name: string): string => readFileSync(fileURLToPath(new URL(`../docs/${name}.md`, import.meta.url)), 'utf8');

describe("kvcustomizer's connectors through the run tool (09 §9.1, ADR 0011)", { timeout: 60_000 }, () => {
  it('QA18-H22 the connectors answer through run, every one has help, and the guide texts write calls in the run form', async () => {
    const { kernel } = await kvcustomizer.start();
    const listed = await runConnector(kernel, { connector: 'ext', command: 'list' });
    expect(listed).toEqual({ exitCode: 0, output: '[]' });
    const guide = await runConnector(kernel, { connector: 'docs', command: 'get', payload: { topic: 'sdk' } });
    expect(guide.exitCode).toBe(0);
    expect(guide.output).toContain('"topic": "sdk"');
    const settings = await runConnector(kernel, { connector: 'kvman', command: 'settings-list' });
    expect(settings.output).toContain('"key": "kernel.language"');
    for (const connector of ['kvman', 'ext', 'preset', 'preview', 'docs']) {
      const help = await runConnector(kernel, { connector, command: 'help' });
      expect(help.output, connector).toMatch(new RegExp(`^${connector}: [\\s\\S]*\\n  help +\\S`));
    }
    const install = await runConnector(kernel, { connector: 'kvman', command: 'help', payload: { command: 'extensions-install' } });
    expect(install.output).toContain('{ "connector": "kvman", "command": "extensions-install", "payload": {"source":"npm:@acme/notes@1.2.3"} }');
    for (const text of [page('init'), page('customizing')]) {
      expect(text).not.toMatch(/'\{[^']*\}'/);
      expect(text).not.toMatch(/ -h\b|--async|heredoc/);
    }
    expect(page('customizing')).toContain('`run { description, connector, command, payload }`');
  });
});
