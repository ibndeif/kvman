import { describe, expect, it } from 'vitest';
import ApprovalsCard from '../../web/src/ApprovalsCard.vue';
import { callView } from '../../web/src/call-view.ts';
import { sizeText } from '../../web/src/call-summary.ts';
import { closedLine, ranCard, type Call } from './support/call-fixtures.ts';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

// Counts that read as words (ADR 0098, 1 and 3): each reads right at one, and a cut search says the first.
const call = (connector: string, command: string, payload: NonNullable<Call['payload']>): Call => ({ connector, command, payload });
const shell = (line: string) => ({ questionId: line, view: callView({ connector: 'shell', command: 'exec', payload: { line } }) });

describe('kvcoder counts in words (ADR 0098, 3)', () => {
  it('QA66-H8 a count of one reads in the singular', async () => {
    const listed = await ranCard(call('fs', 'list', {}), { path: '.', entries: [{ name: 'a.ts', kind: 'file', bytes: 1 }], truncated: false });
    expect(closedLine(listed)).toBe('List . 1 entry');
    const found = await ranCard(call('fs', 'find', { pattern: '*.ts' }), { paths: ['a.ts'], truncated: false });
    expect(closedLine(found)).toBe('Find *.ts 1 file');
    const searched = await ranCard(call('fs', 'search', { pattern: 'x' }), { files: [{ path: 'a.ts', matches: [{ line: 1, text: 'x' }] }], truncated: false });
    expect(closedLine(searched)).toBe('Search x 1 match in 1 file');
    const fake = createFakeKvman();
    expect(sizeText(fake.kvman.t, 1)).toBe('1 byte');
    const one = await mounted(ApprovalsCard, fake, { approvals: [shell('npm ci')] });
    expect(one.text()).toContain('Allow this command?');
    const three = await mounted(ApprovalsCard, createFakeKvman(), { approvals: [shell('npm ci'), shell('npm test'), shell('npm run build')] });
    expect(three.text()).toContain('Allow these 3 commands?');
  });

  it('QA66-E5 a cut search says the first matches, in English and Arabic', async () => {
    const files = Array.from({ length: 9 }, (_file, index) => ({ path: `f${index}.ts`, count: index === 0 ? 20 : 10 }));
    const english = await ranCard(call('fs', 'search', { pattern: 'x', filesOnly: true }), { files, truncated: true });
    expect(closedLine(english)).toBe('Search x The first 100 matches in 9 files');
    const fake = createFakeKvman();
    fake.language.value = 'ar';
    const arabic = await ranCard(call('fs', 'search', { pattern: 'x', filesOnly: true }), { files, truncated: true }, { fake });
    expect(closedLine(arabic)).toContain('أول 100 نتيجة في 9 ملفات');
  });
});
