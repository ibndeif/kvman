import { describe, expect, it } from 'vitest';
import PendingCards from '../../web/src/PendingCards.vue';
import { sizeText } from '../../web/src/call-summary.ts';
import { closedLine, part, pressed, ranCard, type Call } from './support/call-fixtures.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

const call = (connector: string, command: string, payload: Call['payload'] = {}): Call => ({ description: 'Doing it.', connector, command, payload });
const lines = (count: number): string => Array.from({ length: count }, (_line, index) => `line ${index + 1}\n`).join('');

describe("a closed card's line (08 §8.7, ADR 0036, 2)", () => {
  it('QA48-H2 a closed card says what was done, to what, and the outcome', async () => {
    const cards: [Call, Parameters<typeof ranCard>[1]][] = [
      [call('fs', 'edit', { path: 'src/app.ts', edits: [{ oldText: 'a\nb\n', newText: 'a\nB\nc\n' }], risky: false }), { path: 'src/app.ts', replacements: 1, firstChangedLine: 2, fromLine: 1, content: 'a\nB\nc\n' }],
      [call('fs', 'write', { path: 'notes.md', content: 'x', risky: false }), { path: 'notes.md', created: true, bytes: 1229 }],
      [call('fs', 'read', { path: 'src/app.ts', fromLine: 24 }), { path: 'src/app.ts', fromLine: 24, totalLines: 120, content: lines(75) }],
      [call('fs', 'list', { path: 'src' }), { path: 'src', entries: Array.from({ length: 14 }, (_entry, index) => ({ name: `f${index}`, kind: 'file', bytes: 1 })), truncated: false }],
      [call('fs', 'search', { pattern: 'markStatus' }), { files: [{ path: 'a.ts', matches: [{ line: 1, text: 'x' }, { line: 2, text: 'x' }, { line: 3, text: 'x' }, { line: 4, text: 'x' }] }, { path: 'b.ts', matches: [{ line: 1, text: 'x' }, { line: 2, text: 'x' }, { line: 3, text: 'x' }] }, { path: 'c.ts', matches: [{ line: 1, text: 'x' }, { line: 2, text: 'x' }] }], truncated: false }],
      [call('shell', 'exec', { line: 'pnpm test', risky: false }), 'ok'],
      [call('git', 'exec', { args: 'status', risky: false }), 'clean'],
      [call('mcp', 'call', { server: 'github', tool: 'list_issues', risky: false }), 'none'],
      [call('mcp', 'run', { server: 'playwright', steps: [{ tool: 'browser_navigate', arguments: { url: 'http://127.0.0.1:8000' } }, { tool: 'browser_snapshot' }], risky: false }), '## 1. browser_navigate\nok'],
      [call('mcp', 'tools', { server: 'github' }), { server: 'github', tools: Array.from({ length: 12 }, (_tool, index) => ({ name: `t${index}`, description: '' })) }],
      [call('delegate', 'run', { worker: 'reviewer', title: 'Security reviewer', task: 'Review the plan.' }), 'Fine.'],
      [call('background', 'list'), [{ id: 'j1', kind: 'process', call: 'npm run dev', status: 'running', startedAt: 'x' }, { id: 'j2', kind: 'process', call: 'npm test', status: 'exited', startedAt: 'x' }]],
      [call('background', 'output', { id: 'j1' }), { id: 'j1', status: 'running', output: 'ready' }],
      [call('background', 'stop', { id: 'j1' }), { stopped: true }],
      [call('background', 'wait', { id: 'j1' }), { id: 'j1', kind: 'process', call: 'npm test', status: 'succeeded', startedAt: 'x' }],
      [call('execution-map', 'set', { goal: 'Ship the page', steps: [{ id: 'read', title: 'Read', check: 'c' }] }), { goal: 'Ship the page', progress: '0 of 1 done', doing: [], ready: ['read: Read'], waiting: [], failed: [], notes: 0 }],
      [call('execution-map', 'update', { steps: [{ id: 'read', status: 'doing' }, { id: 'build', status: 'doing' }] }), { goal: 'Ship the page', progress: '1 of 3 done', doing: [], ready: [], waiting: [], failed: [], notes: 0 }],
      [call('execution-map', 'note', { text: 'The parser takes two-digit years.' }), { goal: 'Ship the page', progress: '1 of 3 done', doing: [], ready: [], waiting: [], failed: [], notes: 1 }],
      [call('artifact', 'get', { id: 'plan' }), { id: 'plan', title: 'The plan', format: 'markdown', version: 1, content: '# Plan' }],
    ];
    const shown: string[] = [];
    for (const [made, output] of cards) {
      const card = await ranCard(made, output);
      expect(part(card, 'call-label').exists(), `${made.connector} ${made.command}`).toBe(false);
      shown.push(closedLine(card));
      card.unmount();
    }
    expect(shown).toEqual(['Edit src/app.ts +2 −1', 'Write notes.md Created · 1.2 KB', 'Read src/app.ts Lines 24–98 of 120', 'List src 14 entries', 'Search markStatus 9 matches in 3 files', '$ pnpm test', '$ git status', 'github · list_issues', 'playwright · browser_navigate, browser_snapshot', 'Tools github 12 tools', 'Delegate reviewer · Security reviewer', 'Background runs 2 runs', 'Output j1', 'Stop j1', 'Wait for j1 Done', 'Plan Ship the page 0 of 1 done', 'Map step read, build 1 of 3 done', 'Noted for later The parser takes two-digit years.', 'Read artifact plan']);
  });

  it('QA48-H12 a risky call says so, and another does not', async () => {
    const risky = await ranCard(call('shell', 'exec', { line: 'rm -rf dist', risky: true }), 'ok');
    expect(part(risky, 'call-risky').text()).toBe('Risky');
    const safe = await ranCard(call('shell', 'exec', { line: 'ls', risky: false }), 'ok');
    expect(part(safe, 'call-risky').exists()).toBe(false);
  });

  it('QA58-H13 a find call has its own line, and opened lists its paths', async () => {
    const found = await ranCard(call('fs', 'find', { pattern: '*.ts' }), { paths: ['src/a.ts', 'src/b.ts'], truncated: false });
    expect(closedLine(found)).toBe('Find *.ts 2 files');
    const cut = await ranCard(call('fs', 'find', { pattern: '*.ts' }), { paths: ['a.ts'], truncated: true });
    expect(closedLine(cut)).toBe('Find *.ts The first 1 files');
  });

  it('QA48-E8 a cut list or search says the first', async () => {
    const list = await ranCard(call('fs', 'list', {}), { path: '.', entries: Array.from({ length: 1000 }, (_entry, index) => ({ name: `f${index}`, kind: 'file', bytes: 1 })), truncated: true });
    expect(closedLine(list)).toBe('List . The first 1000 entries');
    const files = Array.from({ length: 12 }, (_file, index) => ({ path: `f${index}.ts`, matches: Array.from({ length: index < 8 ? 17 : 16 }, (_match, line) => ({ line: line + 1, text: 'x' })) }));
    const search = await ranCard(call('fs', 'search', { pattern: 'x' }), { files, truncated: true });
    expect(closedLine(search)).toBe('Search x The first 200 matches in 12 files');
  });

  it('QA48-E9 a pending call has no outcome', async () => {
    const pending = [{ toolCallId: 'c1', kind: 'approval' as const, questionId: 'a1', question: { description: 'Writing the notes.', connector: 'fs', command: 'write', payload: { path: 'notes.md', content: 'hello\n', risky: true } }, childSessionId: null }];
    const cards = await mounted(PendingCards, createFakeKvman(), { pending });
    expect(closedLine(cards)).toBe('Write notes.md');
    expect(part(cards, 'call-outcome').exists()).toBe(false);
  });

  it('QA48-E10 a size is in bytes, then KB and MB with one decimal', () => {
    const t = createFakeKvman().kvman.t;
    expect([512, 1229, 3_145_728].map((bytes) => sizeText(t, bytes))).toEqual(['512 bytes', '1.2 KB', '3.0 MB']);
  });

  it('QA48-E11 a registered connector, and a failed ask, keep connector · command', async () => {
    const registered = await ranCard(call('notes', 'add', { title: 'Milk' }), { id: 'n1' });
    expect(closedLine(registered)).toBe('notes · add');
    expect(part(registered, 'call-summary').exists()).toBe(false);
    const ask = await ranCard(call('ask', 'text', { prompt: 'Name?' }), 'error VALIDATION_FAILED: The prompt is empty.', { failed: true });
    expect(closedLine(ask)).toBe('ask · text');
  });

  it('QA48-E16 in an Arabic page the words and the fold button are Arabic, and the path stays left to right', async () => {
    const fake = createFakeKvman();
    fake.language.value = 'ar';
    const edit = await ranCard(call('fs', 'edit', { path: 'src/app.ts', edits: [{ oldText: 'a', newText: 'b' }], risky: false }), { path: 'src/app.ts', replacements: 1, firstChangedLine: 1, fromLine: 1, content: 'b' }, { fake });
    expect(part(edit, 'call-words').text()).toBe('تعديل');
    expect(part(edit, 'call-subject').text()).toBe('src/app.ts');
    expect(part(edit, 'call-subject').classes()).toContain('kvc-mono');
    expect([part(edit, 'call-outcome').text(), part(edit, 'call-outcome').attributes('dir')]).toEqual(['+1 −1', 'ltr']);
    const read = await ranCard(call('fs', 'read', { path: 'a.txt' }), { path: 'a.txt', fromLine: 1, totalLines: 40, content: lines(40) }, { fake });
    expect(part(read, 'call-outcome').attributes('dir')).toBeUndefined();
    await pressed(read);
    expect(part(read, 'show-all').text()).toBe('عرض كل الأسطر (40)');
  });

  it('QA57-H2 a call with no description is titled by its own line: an artifact write or edit, and help, in English and Arabic', async () => {
    const bare = (connector: string, command: string, payload: Call['payload'] = {}): Call => ({ connector, command, payload });
    const made: [Call, Parameters<typeof ranCard>[1]][] = [
      [bare('artifact', 'write', { id: 'plan', title: 'The plan', content: '# Plan' }), { id: 'plan', version: 1 }],
      [bare('artifact', 'edit', { id: 'plan', edits: [{ oldText: 'Plan', newText: 'Roadmap' }] }), { id: 'plan', version: 2 }],
      [bare('fs', 'help', { command: 'edit' }), 'fs edit: Replaces text.'],
      [bare('fs', 'help'), 'fs: Files.'],
    ];
    const shown: string[] = [];
    for (const [call, output] of made) {
      const card = await ranCard(call, output);
      expect(part(card, 'call-description').exists()).toBe(false);
      shown.push(closedLine(card));
    }
    expect(shown).toEqual(['Write artifact plan', 'Edit artifact plan', 'Help fs edit', 'Help fs']);
    const fake = createFakeKvman();
    fake.language.value = 'ar';
    const words = await Promise.all(made.slice(0, 3).map(async ([call, output]) => part(await ranCard(call, output, { fake }), 'call-words').text()));
    expect(words).toEqual(['كتابة المُخرَج', 'تعديل المُخرَج', 'مساعدة']);
  });

  it('QA54-H9 a detail call names the step it detailed, in English and Arabic', async () => {
    const made = call('execution-map', 'detail', { id: 'read', details: '## Read' });
    const output = { goal: 'Ship the page', progress: '0 of 2 done', doing: [], ready: ['read: Read'], waiting: [], failed: [], undetailed: ['build: Build'], notes: 0 };
    expect(closedLine(await ranCard(made, output))).toBe('Step details read 0 of 2 done');
    const fake = createFakeKvman();
    fake.language.value = 'ar';
    expect(part(await ranCard(made, output, { fake }), 'call-words').text()).toBe('تفاصيل خطوة');
  });
});
