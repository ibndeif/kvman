import { describe, expect, it } from 'vitest';
import { callView, shortLine } from '../../web/src/call-view.ts';

describe('what a call shows the person (08 §8.7, ADR 0011, 13)', () => {
  it('QA18-H19 a run call is its description, its connector and command, its line, and its payload (ADR 0036)', () => {
    expect(callView({ description: 'Listing the files.', connector: 'shell', command: 'exec', payload: { line: 'ls -a | wc -l', risky: false } })).toEqual({ description: 'Listing the files.', connector: 'shell', command: 'exec', label: 'shell · exec', line: 'ls -a | wc -l', fields: { line: 'ls -a | wc -l', risky: false } });
    expect(callView({ description: 'Checking what changed.', connector: 'git', command: 'exec', payload: { args: 'status --short' } })).toMatchObject({ description: 'Checking what changed.', label: 'git · exec', line: 'git status --short' });
    expect(callView({ description: 'Starting the server.', connector: 'shell', command: 'exec', payload: { line: 'npm run dev', background: true } })).toMatchObject({ line: 'npm run dev', background: true });
    expect(callView({ description: 'Editing app.ts.', connector: 'fs', command: 'edit', payload: { path: 'src/app.ts' } })).toEqual({ description: 'Editing app.ts.', connector: 'fs', command: 'edit', label: 'fs · edit', fields: { path: 'src/app.ts' } });
    expect(callView({ description: 'Listing the background runs.', connector: 'background', command: 'list' })).toEqual({ description: 'Listing the background runs.', connector: 'background', command: 'list', label: 'background · list', fields: {} });
    expect(callView({ description: 'Removing the build.', connector: 'shell', command: 'exec', payload: { line: 'rm -rf dist', risky: true } }).risky).toBe(true);
  });

  it('QA18-H20 a call still being written shows what is complete so far', () => {
    expect(callView({ description: 'Editing app.ts.' })).toEqual({ description: 'Editing app.ts.' });
    expect(callView({ description: '  ', connector: 'fs' })).toEqual({ connector: 'fs', fields: {} });
    expect(callView({ description: 'Editing app.ts.', connector: 'fs', command: 'edit', payload: null })).toEqual({ description: 'Editing app.ts.', connector: 'fs', command: 'edit', label: 'fs · edit', fields: {} });
  });

  it('QA18-E22 a call stored before the run tool shows its command line, with the title or description it came with', () => {
    expect(callView({ command: 'ls -a' })).toEqual({ line: 'ls -a' });
    expect(callView({ title: 'Run the tests', description: 'Checks the page.', command: 'npm test' })).toEqual({ description: 'Run the tests', line: 'npm test' });
    expect(callView({ description: 'Serves the app.', command: 'npm run dev', mode: 'async' })).toEqual({ description: 'Serves the app.', line: 'npm run dev', background: true });
  });

  it("QA9-H9 a card's line is one short line", () => {
    expect(shortLine('c'.repeat(250))).toBe(`${'c'.repeat(200)}…`);
    expect(shortLine('{\n  "path": "a.txt"\n}')).toBe('{ "path": "a.txt" }');
  });
});
