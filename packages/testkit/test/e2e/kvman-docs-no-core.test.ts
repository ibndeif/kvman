import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { runBin } from '../support/run-bin.ts';
import { writeDocsFixtures, writeDocsPreset } from '../support/docs-fixtures.ts';
import { startKvman, useDocsSandbox } from '../support/kvman-child.ts';

const makeSandbox = useDocsSandbox();

describe('kvman-docs with no core extension loaded (ADR 0010, 16)', () => {
  it('QA17-H28 a preset of one path extension starts, lists only it, and serves its docs', async () => {
    const sandbox = makeSandbox();
    const all = writeDocsFixtures(path.join(sandbox.root, 'fixtures'));
    const extensions: Record<string, string> = {};
    for (const name of ['@fix/ok', '@fix/webhome']) {
      const source = all[name];
      if (source === undefined) throw new Error(`Missing fixture ${name}.`);
      extensions[name] = source;
    }
    const running = await startKvman(sandbox, ['--preset', writeDocsPreset(sandbox.root, extensions)]);

    const response = await fetch(`http://127.0.0.1:${String(running.port)}/api/queries/kernel.extensions.list`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":{}}',
    });
    const envelope = z.object({ ok: z.literal(true), output: z.array(z.object({ name: z.string() })) }).parse(await response.json());
    expect(envelope.output.map((extension) => extension.name).sort()).toEqual(['@fix/ok', '@fix/webhome']);

    const list = await runBin('docs/docs-bin.js', ['list', '--home', running.home, '--json'], { cwd: running.home });
    expect(list.exitCode).toBe(0);
    expect(list.stderr).toBe('');
    expect(JSON.parse(list.stdout)).toEqual({
      pages: [
        { extension: 'kvman', topic: 'i18n', title: 'Texts and languages' },
        { extension: 'kvman', topic: 'presets', title: 'Presets' },
        { extension: 'kvman', topic: 'sdk', title: 'The extension API (`@kvman/sdk`)' },
        { extension: '@fix/ok', topic: 'settings', title: 'Ok settings' },
        { extension: '@fix/ok', topic: 'usage', title: 'Using ok' },
      ],
      problems: [],
    });

    const get = await runBin('docs/docs-bin.js', ['get', '@fix/ok', 'usage', '--home', running.home], { cwd: running.home });
    expect(get.exitCode).toBe(0);
    expect(get.stderr).toBe('');
    expect(get.stdout).toBe('# Using ok\n\nThe Using ok page.\n\n');
  });
});
