import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from '../support/npm-mirror.ts';
import { previewHomePath, usePreviewSandbox } from '../support/preview-world.ts';

// `kvman-preview` against the real kvman built from source (09 §9.3): the bin starts the CLI entry with its own
// conditions, the demo project's query answers over HTTP, the web app serves a page, and SIGINT stops everything.
const makeSandbox = usePreviewSandbox();

describe('kvman-preview against the real kvman (09 §9.3)', () => {
  it('QA17-H13 previews the demo project, answers demo.answer, serves a page, and stops on SIGINT', async () => {
    const sandbox = makeSandbox();
    const made = sandbox.project('demo');
    const kvmanEntry = path.join(repositoryRoot, 'packages/cli/src/main.ts');
    const home = previewHomePath('h13-real');
    const handle = sandbox.start([made.folder, '--kvman', kvmanEntry, '--name', 'h13-real', '--json'], { cwd: sandbox.root });
    const url = (JSON.parse(await handle.line) as { url: string }).url;
    const match = /^http:\/\/127\.0\.0\.1:(\d+)\/$/.exec(url);
    expect(match).not.toBeNull();
    const answered = await fetch(`${url}api/queries/demo.answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"input":{}}',
    });
    expect(answered.status).toBe(200);
    expect(await answered.json()).toMatchObject({ ok: true, output: { answer: 42 } });
    const page = await fetch(url);
    expect(page.status).toBe(200);
    handle.signal('SIGINT');
    expect(await handle.exit).toEqual({ code: 0, signal: null });
    await expect(fetch(url)).rejects.toThrow();
    expect(existsSync(home)).toBe(false);
  });
});
