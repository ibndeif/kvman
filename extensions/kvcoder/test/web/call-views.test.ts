import { describe, expect, it } from 'vitest';
import { closedLine, isOpen, part, parts, pressed, ranCard, shownLines, type Call } from './support/call-fixtures.ts';

const call = (connector: string, command: string, payload: Call['payload'] = {}): Call => ({ description: 'Doing it.', connector, command, payload });
const lines = (count: number): string => Array.from({ length: count }, (_line, index) => `line ${index + 1}\n`).join('');

describe("an opened card shows the call by its kind (08 §8.7, ADR 0036, 3 and 5 to 8)", () => {
  it('QA48-H3 and QA61-H2 an edit starts closed, and opened shows a diff per edit, each line in its own direction, and no JSON', async () => {
    const edits = [
      { oldText: '# الحقول المطلوبة\nappealNumber: رقم التظلم\n', newText: '# رقم التظلم\nappealNumber: رقم التظلم الخاص\nلا ترجع appealNumber\n' },
      { oldText: '- لا ترجع التواريخ.', newText: '- لا ترجع التواريخ.\n- العلامة محل التظلم.' },
    ];
    const card = await ranCard(call('fs', 'edit', { path: 'lib/prompts/extract.txt', risky: false, edits }), { path: 'lib/prompts/extract.txt', replacements: 2, firstChangedLine: 27, fromLine: 24, content: 'x\n' });
    expect(isOpen(card)).toBe(false);
    await pressed(card);
    const diffs = parts(card, 'call-diff').map((diff) => diff.findAll('[data-test="call-line-row"]').map((row) => row.attributes('data-kind')));
    expect(diffs).toEqual([['removed', 'removed', 'added', 'added', 'added'], ['context', 'added']]);
    expect(parts(card, 'call-line-text').map((line) => line.attributes('dir'))).toEqual(Array.from({ length: 7 }, () => 'auto'));
    expect(shownLines(card, 'call-diff')[2]).toBe('+# رقم التظلم');
    expect(part(card, 'call-replacements').text()).toBe('Replaced: 2 · from line 27');
    const text = part(card, 'call-card').text();
    for (const hidden of ['\\n', 'oldText', 'risky', 'firstChangedLine', '{']) expect(text, hidden).not.toContain(hidden);
  });

  it('QA48-H4 and QA61-H2 a write starts closed, and opened shows its content as numbered lines', async () => {
    const card = await ranCard(call('fs', 'write', { path: 'notes.md', content: '# Notes\n\nMilk\n', risky: false }), { path: 'notes.md', created: true, bytes: 15 });
    expect(isOpen(card)).toBe(false);
    await pressed(card);
    expect(shownLines(card, 'call-content')).toEqual(['1# Notes', '2', '3Milk']);
    expect(part(card, 'call-result-fields').exists()).toBe(false);
  });

  it('QA48-H5 a read is closed, and opened it shows its lines with their real numbers', async () => {
    const card = await ranCard(call('fs', 'read', { path: 'src/app.ts', fromLine: 24, lines: 2 }), { path: 'src/app.ts', fromLine: 24, totalLines: 120, content: 'const a = 1;\nconst b = 2;\n' });
    expect(isOpen(card)).toBe(false);
    await pressed(card);
    expect(shownLines(card, 'call-content')).toEqual(['24const a = 1;', '25const b = 2;']);
  });

  it('QA48-H6 a list shows a row per entry, with a size for a file', async () => {
    const card = await ranCard(call('fs', 'list', { path: 'src' }), { path: 'src', entries: [{ name: 'lib', kind: 'folder', bytes: 0 }, { name: 'app.ts', kind: 'file', bytes: 2048 }], truncated: false });
    await pressed(card);
    expect(parts(card, 'call-entry').map((row) => [row.attributes('data-kind'), row.find('[data-test="call-entry-name"]').text(), row.find('[data-test="call-entry-size"]').exists() ? row.find('[data-test="call-entry-size"]').text() : null])).toEqual([['folder', 'lib', null], ['file', 'app.ts', '2.0 KB']]);
  });

  it("QA48-H7 a search shows each file's matches under its path, with their line numbers", async () => {
    const files = [{ path: 'src/a.ts', matches: [{ line: 3, text: 'const status = 1;' }, { line: 40, text: 'return status;' }] }, { path: 'src/b.ts', matches: [{ line: 7, text: 'status()' }] }];
    const card = await ranCard(call('fs', 'search', { pattern: 'status', path: 'src' }), { files, truncated: false });
    await pressed(card);
    expect(parts(card, 'call-file').map((file) => [file.find('[data-test="call-file-path"]').text(), file.findAll('[data-test="call-line-row"]').map((row) => row.text())])).toEqual([['src/a.ts', ['3const status = 1;', '40return status;']], ['src/b.ts', ['7status()']]]);
  });

  it("QA48-H8 an mcp call shows its arguments and the tool's text, without risky or timeoutMs", async () => {
    const card = await ranCard(call('mcp', 'call', { server: 'github', tool: 'list_issues', arguments: { repo: 'kvman', state: 'open' }, timeoutMs: 5000, risky: false }), 'No open issues.');
    await pressed(card);
    expect(card.findAll('[data-test="call-payload-fields"] [data-test="field-row"]').map((row) => row.text())).toEqual(['repokvman', 'stateopen']);
    expect(part(card, 'call-output').text()).toBe('No open issues.');
    const text = part(card, 'call-card').text();
    expect(text).not.toContain('risky');
    expect(text).not.toContain('timeoutMs');
  });

  it("QA48-H18 an mcp run shows its numbered steps with their arguments, then the tools' text", async () => {
    const steps = [{ tool: 'browser_navigate', arguments: { url: 'http://127.0.0.1:33473/research' } }, { tool: 'browser_wait_for', arguments: { time: 60 } }, { tool: 'browser_console_messages' }];
    const card = await ranCard(call('mcp', 'run', { server: 'playwright', steps, timeoutMs: 30000, risky: true }), '## 1. browser_navigate\nDone.');
    await pressed(card);
    const shown = parts(card, 'call-step').map((step) => [step.find('[data-test="call-step-tool"]').text(), step.findAll('[data-test="field-row"]').map((row) => row.text()), step.find('[data-test="field-empty"]').exists()]);
    expect(shown).toEqual([['1. browser_navigate', ['urlhttp://127.0.0.1:33473/research'], false], ['2. browser_wait_for', ['time60'], false], ['3. browser_console_messages', [], true]]);
    expect(part(card, 'call-output').text()).toContain('## 1. browser_navigate');
    const request = part(card, 'call-steps').text();
    for (const hidden of ['server', 'steps', 'arguments', 'risky', 'timeoutMs', 'playwright']) expect(request, hidden).not.toContain(hidden);
  });

  it('QA48-E21 an mcp run step being written shows its number, and steps that are not a list show none', async () => {
    const writing = await ranCard(call('mcp', 'run', { server: 'playwright', steps: [{ tool: 'browser_navigate', arguments: { url: 'http://127.0.0.1:3000/' } }, { arguments: {} }], risky: false }), 'Done.');
    await pressed(writing);
    expect(parts(writing, 'call-step-tool').map((tool) => tool.text())).toEqual(['1. browser_navigate', '2.']);
    const broken = await ranCard(call('mcp', 'run', { server: 'playwright', steps: 'browser_navigate', risky: false }), 'Done.');
    await pressed(broken);
    expect(part(broken, 'call-steps').exists()).toBe(false);
    expect(part(broken, 'call-payload-fields').exists()).toBe(false);
  });

  it('QA48-H9 a delegate run shows its task as text and the answer in Markdown', async () => {
    const card = await ranCard(call('delegate', 'run', { worker: 'reviewer', title: 'Helper', task: 'Review the plan.\nSay what is missing.' }), '**Nothing** is missing.');
    await pressed(card);
    expect(shownLines(card, 'call-task')).toEqual(['Review the plan.', 'Say what is missing.']);
    expect(part(card, 'call-answer').find('[data-test="markdown"]').text()).toBe('**Nothing** is missing.');
  });

  it('QA48-H11 a block of more than 12 lines shows 12 until the person asks for all', async () => {
    const card = await ranCard(call('fs', 'read', { path: 'a.txt' }), { path: 'a.txt', fromLine: 1, totalLines: 40, content: lines(40) });
    await pressed(card);
    expect(shownLines(card, 'call-content')).toHaveLength(12);
    expect(part(card, 'show-all').text()).toBe('Show all 40 lines');
    await part(card, 'show-all').trigger('click');
    expect(shownLines(card, 'call-content')).toHaveLength(40);
    expect(part(card, 'show-all').text()).toBe('Show fewer');
    await part(card, 'show-all').trigger('click');
    expect(shownLines(card, 'call-content')).toHaveLength(12);
  });

  it('QA48-H17 a long output shows its first 12 lines, a line of dots, and its last 5', async () => {
    const output = (count: number): string => Array.from({ length: count }, (_line, index) => `line ${index + 1}`).join('\n');
    const card = await ranCard(call('shell', 'exec', { line: 'pnpm test', risky: false }), output(40));
    await pressed(card);
    expect(part(card, 'call-output').text().split('\n')).toEqual([...Array.from({ length: 12 }, (_line, index) => `line ${index + 1}`), '⋯', 'line 36', 'line 37', 'line 38', 'line 39', 'line 40']);
    expect(part(card, 'show-all').text()).toBe('Show all 40 lines');
    await part(card, 'show-all').trigger('click');
    expect(part(card, 'call-output').text()).toBe(output(40));
    const short = await ranCard(call('shell', 'exec', { line: 'ls', risky: false }), output(17));
    await pressed(short);
    expect(part(short, 'call-output').text()).toBe(output(17));
    expect(part(short, 'show-all').exists()).toBe(false);
  });

  it('QA48-E5 a failed call starts closed with its reason, and opened keeps its error and request behind Show details', async () => {
    const error = "error NOT_FOUND: missing.txt doesn't exist. Nothing was written.";
    const card = await ranCard(call('fs', 'edit', { path: 'missing.txt', edits: [{ oldText: 'a', newText: 'b' }], risky: false }), error, { failed: true });
    expect(isOpen(card)).toBe(false);
    expect(part(card, 'call-reason').text()).toBe("missing.txt doesn't exist. Nothing was written.");
    await pressed(card);
    expect([part(card, 'call-error').exists(), part(card, 'call-diff').exists()]).toEqual([false, false]);
    await part(card, 'call-details').trigger('click');
    expect(part(card, 'call-error').text()).toBe(error);
    const html = card.html();
    expect(html.indexOf('data-test="call-error"')).toBeLessThan(html.indexOf('data-test="call-diff"'));
    expect(part(card, 'call-output').exists()).toBe(false);
  });

  it('QA48-E6 a failed line starts closed and says the command failed, and opened keeps its line and its output', async () => {
    const card = await ranCard(call('shell', 'exec', { line: 'npm test', risky: false }), 'FAIL 1\n[exit code 1]', { failed: true });
    expect(isOpen(card)).toBe(false);
    expect(part(card, 'call-reason').text()).toBe('The command failed.');
    await pressed(card);
    expect([part(card, 'call-payload').text(), part(card, 'call-output').text()]).toEqual(['$ npm test', 'FAIL 1\n[exit code 1]']);
    expect(part(card, 'call-error').exists()).toBe(false);
  });

  it('QA48-E7 every other card starts closed, and a press opens or closes any card', async () => {
    const closed: [Call, Parameters<typeof ranCard>[1]][] = [
      [call('fs', 'read', { path: 'a.txt' }), { path: 'a.txt', fromLine: 1, totalLines: 1, content: 'a\n' }],
      [call('fs', 'list', {}), { path: '.', entries: [], truncated: false }],
      [call('fs', 'search', { pattern: 'a' }), { files: [], truncated: false }],
      [call('shell', 'exec', { line: 'ls', risky: false }), 'a'],
      [call('notes', 'add', { title: 'Milk' }), { id: 'n1' }],
    ];
    for (const [made, output] of closed) expect(isOpen(await ranCard(made, output)), `${made.connector} ${made.command}`).toBe(false);
    const edit = await ranCard(call('fs', 'edit', { path: 'a.txt', edits: [{ oldText: 'a', newText: 'b' }], risky: false }), { path: 'a.txt', replacements: 1, firstChangedLine: 1, fromLine: 1, content: 'b' });
    expect(isOpen(edit)).toBe(false);
    expect(part(edit, 'call-diff').exists()).toBe(false);
    await pressed(edit);
    expect(isOpen(edit)).toBe(true);
    await pressed(edit);
    expect(isOpen(edit)).toBe(false);
  });

  it("QA48-E12 a result that isn't what the kind returns shows as text, and the closed line has no outcome", async () => {
    const card = await ranCard(call('fs', 'read', { path: 'a.txt' }), 'This file is unchanged since you read it.');
    expect(closedLine(card)).toBe('Read a.txt');
    await pressed(card);
    expect(part(card, 'call-output').text()).toBe('This file is unchanged since you read it.');
    expect(part(card, 'call-content').exists()).toBe(false);
  });
});

describe('a count that reads right in the singular (ADR 0090, 6)', () => {
  it('QA58-H10 an edit with one replacement says Replaced: 1', async () => {
    const card = await ranCard(call('fs', 'edit', { path: 'a.ts', risky: false, edits: [{ oldText: 'a', newText: 'b' }] }), { path: 'a.ts', replacements: 1, firstChangedLine: 82, fromLine: 79, content: 'b\n' });
    await pressed(card);
    expect(part(card, 'call-replacements').text()).toBe('Replaced: 1 · from line 82');
  });
});
