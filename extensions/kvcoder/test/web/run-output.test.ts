import { describe, expect, it } from 'vitest';
import { closedLine, part, pressed, ranCard, type Call } from './support/call-fixtures.ts';

const id = '01a12465-b88a-7174-bbc9-2ea8a0779ae9';
const read: Call = { description: 'Reading the review result.', connector: 'background', command: 'output', payload: { id } };
const lines = (count: number): string => Array.from({ length: count }, (_line, index) => `line ${index + 1}`).join('\n');

describe('a `background output` card reads as the run it read (08 §8.7, ADR 0062, 2)', () => {
  it('M2.4-E212 a running run shows its description and status, and none of its row as fields', async () => {
    const card = await ranCard(read, { id, kind: 'subagent', call: 'Requesting a fresh read-only review.', status: 'running', startedAt: '2026-10-10T06:00:08.586Z' });
    expect(closedLine(card)).toBe(`Output ${id} Running`);
    await pressed(card);
    expect(part(card, 'run-call').text()).toBe('Requesting a fresh read-only review.');
    expect(part(card, 'run-status').text()).toBe('Running');
    for (const absent of ['run-time', 'call-payload-fields', 'call-result-fields', 'call-fields', 'call-output', 'call-answer', 'run-problem']) expect(part(card, absent).exists(), absent).toBe(false);
    const text = part(card, 'call-card').text();
    for (const hidden of ['kind', 'startedAt', '2026-10-10', 'subagent']) expect(text, hidden).not.toContain(hidden);
    expect(text.split(id)).toHaveLength(2);
  });

  it('M2.4-E213 an ended run shows its exit code, its time, and its output by its kind', async () => {
    const times = { startedAt: '2026-10-10T06:00:00.000Z', endedAt: '2026-10-10T06:01:09.000Z' };
    const failed = await ranCard(read, { id, kind: 'process', call: 'pnpm test', status: 'failed', ...times, exitCode: 2, output: lines(30) });
    expect(closedLine(failed)).toBe(`Output ${id} Failed`);
    await pressed(failed);
    expect(part(failed, 'run-status').text()).toBe('Failed · exit 2');
    expect(part(failed, 'run-time').text()).toBe('1 min 9 s');
    expect(part(failed, 'call-output').text().split('\n')).toEqual([...lines(12).split('\n'), '⋯', 'line 26', 'line 27', 'line 28', 'line 29', 'line 30']);

    const helper = await ranCard(read, { id, kind: 'subagent', call: 'Review the plan.', status: 'succeeded', ...times, output: '**Nothing** is missing.' });
    await pressed(helper);
    expect(part(helper, 'run-status').text()).toBe('Done');
    expect(part(helper, 'call-answer').find('[data-test="markdown"]').text()).toBe('**Nothing** is missing.');
    expect(part(helper, 'call-output').exists()).toBe(false);

    const broken = await ranCard(read, { id, kind: 'worker', call: 'Run the linter.', status: 'interrupted', ...times, problem: 'kvman stopped while it ran.', output: 'half' });
    await pressed(broken);
    const shown = [...part(broken, 'call-card').element.querySelectorAll('[data-test="run-problem"], [data-test="call-output"]')].map((found) => found.getAttribute('data-test'));
    expect(shown).toEqual(['run-problem', 'call-output']);
    expect(part(broken, 'run-problem').classes()).toContain('kvc-error');

    const other = await ranCard(read, { id, status: 'running', output: 'ready' });
    expect(closedLine(other)).toBe(`Output ${id}`);
    await pressed(other);
    expect(part(other, 'run-row').exists()).toBe(false);
    expect(part(other, 'call-result-fields').exists()).toBe(true);
  });
});
