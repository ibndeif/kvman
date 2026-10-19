import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall } from './support/model-script.ts';
import { turnState } from './support/turns.ts';

const looked = useLooked();

// The person's check after file changes (08 §8.3, ADR 0094, 3). The lines are bash, the Linux and macOS branch.
const withCheck = (line: string, more: Record<string, unknown> = {}) => ({ 'kvcoder.check': { line, ...more } }) as unknown as Record<string, string>;
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These lines are bash; Windows runs PowerShell.');
}

describe('the check after edits (ADR 0094, 3)', { timeout: 60_000 }, () => {
  it('QA62-H4 the last change that ran at once ends with the check, its exit code, and its output', async () => {
    posixShell();
    const { results } = await looked(() => undefined, [fsCall('write', { path: 'a.txt', content: 'one\n' }), fsCall('write', { path: 'b.txt', content: 'two\n' })], withCheck('echo checked; exit 3'));
    expect(results[0]).not.toContain('[kvman ran the check');
    expect(results[1]).toMatch(/\n\n\[kvman ran the check: echo checked; exit 3, exit code 3\]\nchecked$/);
  });

  it('QA62-E3 no check without a change, with no setting, for a failed change, or a change that waited for an approval', async () => {
    posixShell();
    const reads = await looked((folder) => looked.write(folder, 'a.txt', 'x\n'), [fsCall('read', { path: 'a.txt' })], withCheck('echo checked'));
    expect(reads.results[0]).not.toContain('[kvman ran the check');
    const unset = await looked(() => undefined, [fsCall('write', { path: 'a.txt', content: 'x' })]);
    expect(unset.results[0]).not.toContain('[kvman ran the check');
    const failed = await looked((folder) => looked.write(folder, 'a.txt', 'x\n'), [fsCall('edit', { path: 'a.txt', edits: [{ oldText: 'x', newText: 'y' }] })], withCheck('echo checked'));
    expect(failed.results[0]).toMatch(/^error VALIDATION_FAILED/);
    expect(failed.results[0]).not.toContain('[kvman ran the check');
    const waited = await looked(() => undefined, [fsCall('write', { path: 'a.txt', content: 'x', risky: true })], withCheck('echo checked'));
    const { turn } = await turnState(waited.kernel, waited.sessionId);
    await waited.kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await waited.kernel.clock.advance(0);
    expect(waited.fake.requests().length).toBeGreaterThan(1);
    const { messages } = await waited.kernel.exec('kvcoder.message.list', { sessionId: waited.sessionId, limit: 50 });
    expect(JSON.stringify(messages)).not.toContain('[kvman ran the check');
  });

  it("QA62-E4 the output is cut to its last 4 KB, and a check past its time says so", async () => {
    posixShell();
    const long = await looked(() => undefined, [fsCall('write', { path: 'a.txt', content: 'x' })], withCheck("printf 'start%.0s' 1; head -c 6000 /dev/zero | tr '\\\\0' y; echo; echo end"));
    const shown = (long.results[0] ?? '').split('exit code 0]\n')[1] ?? '';
    expect(shown.startsWith('…')).toBe(true);
    expect(Buffer.byteLength(shown)).toBeLessThanOrEqual(4096 + Buffer.byteLength('…'));
    expect(shown.endsWith('end')).toBe(true);
    const slow = await looked(() => undefined, [fsCall('write', { path: 'a.txt', content: 'x' })], withCheck('sleep 5', { timeoutMs: 1000 }));
    expect(slow.results[0]).toContain('[kvman ran the check: sleep 5, exit code 124, timed out after 1 s]');
  });
});
