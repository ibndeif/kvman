import { describe, expect, it } from 'vitest';
import { treeKill } from '../../src/calls/shell-command.ts';
import { answerOf, commandLine, runResult } from '../../src/delegate/programs.ts';
import { programSpawn, runProgram } from '../../src/delegate/run-program.ts';
import { shippedWorkers, workerSchema, workersSchema, type ProgramWorker } from '../../src/delegate/workers.ts';
import { programWorker } from '../support/worker-programs.ts';

const parsed = (name: string, kind: 'opencode' | 'pi' | 'claude', fields: Record<string, unknown> = {}): ProgramWorker => workerSchema.parse(programWorker(name, kind, fields as never)) as ProgramWorker;
const event = (value: unknown): string => JSON.stringify(value);

describe('program workers: their entries, command lines, and answers (08 §8.5, ADR 0021, 13, 31, and 32)', () => {
  it('QA32-H1 the three kinds are entries of the setting, beside the shipped five', () => {
    const entries = [programWorker('oc', 'opencode'), programWorker('pie', 'pi'), programWorker('cc', 'claude'), programWorker('full', 'pi', { model: 'x/y', thinking: 'xhigh', tools: ['read', 'bash'] })];
    expect(workersSchema.parse([...shippedWorkers, ...entries]).map((worker) => worker.kind)).toEqual(['subagent', 'subagent', 'subagent', 'subagent', 'subagent', 'opencode', 'pi', 'claude', 'pi']);
    expect(parsed('cc', 'claude')).toMatchObject({ approval: 'auto', timeoutMs: 600_000, model: null, effort: null, permissionMode: 'acceptEdits' });
  });

  it("QA32-H2 each kind's command line, with every field set and with every field null", () => {
    expect(commandLine(parsed('oc', 'opencode'), 'Do it')).toEqual({ command: 'opencode', args: ['run', '--format', 'json', '--auto', '--', 'Do it'] });
    expect(commandLine(parsed('oc', 'opencode', { model: 'zai/glm', agent: 'build', autoApprove: false, instructions: 'Be brief.' }), '-x Do it')).toEqual({ command: 'opencode', args: ['run', '--format', 'json', '--model', 'zai/glm', '--agent', 'build', '--', 'Be brief.\n\n-x Do it'] });
    expect(commandLine(parsed('pie', 'pi'), 'Do it')).toEqual({ command: 'pi', args: ['-p', '--', 'Do it'] });
    expect(commandLine(parsed('pie', 'pi', { model: 'a/b', thinking: 'high', tools: ['read', 'bash'], instructions: 'Be brief.' }), 'Do it')).toEqual({ command: 'pi', args: ['-p', '--model', 'a/b', '--thinking', 'high', '--tools', 'read,bash', '--append-system-prompt', 'Be brief.', '--', 'Do it'] });
    expect(commandLine(parsed('cc', 'claude'), 'Do it')).toEqual({ command: 'claude', args: ['-p', '--permission-mode', 'acceptEdits', '--', 'Do it'] });
    expect(commandLine(parsed('cc', 'claude', { model: 'sonnet', effort: 'high', permissionMode: 'plan', instructions: 'Be brief.' }), 'Do it')).toEqual({ command: 'claude', args: ['-p', '--permission-mode', 'plan', '--model', 'sonnet', '--effort', 'high', '--append-system-prompt', 'Be brief.', '--', 'Do it'] });
  });

  it("QA32-H3 each kind's answer: the output of pi and claude, and opencode's text after its last tool call", () => {
    expect(answerOf('claude', '\nAll done.\n\n')).toEqual({ answer: 'All done.', reasons: [] });
    expect(answerOf('pi', 'One\nTwo\n')).toEqual({ answer: 'One\nTwo', reasons: [] });
    const lines = [event({ type: 'step_start' }), event({ type: 'text', part: { text: 'Looking.' } }), event({ type: 'tool_use', part: { tool: 'read' } }), 'not json', '{ broken', event({ type: 'text', part: { text: 'Found it.' } }), event({ type: 'text', part: { text: 'Fixed.' } })];
    expect(answerOf('opencode', lines.join('\n'))).toEqual({ answer: 'Found it.\n\nFixed.', reasons: [] });
    expect(answerOf('opencode', [event({ type: 'error', error: { message: 'Rate limit exceeded.' } }), event({ type: 'error', error: {} })].join('\n'))).toEqual({ answer: '', reasons: ['Rate limit exceeded.'] });
  });

  it.each([
    ["a subagent's field", { connectors: null }],
    ['a time limit under a minute', { timeoutMs: 59_999 }],
    ['a time limit over two hours', { timeoutMs: 7_200_001 }],
    ['an approval that is neither', { approval: 'never' }],
    ['a permission mode claude has not', { permissionMode: 'manual' }],
    ['an effort claude has not', { effort: 'minimal' }],
    ['an empty model', { model: '' }],
  ])('QA32-E1 the setting is strict for a program kind: %s', (_case, fields) => {
    expect(workerSchema.safeParse(programWorker('cc', 'claude', fields as never)).success).toBe(false);
    expect(workerSchema.safeParse(programWorker('pie', 'pi', { thinking: 'huge' })).success).toBe(false);
    expect(workerSchema.safeParse(programWorker('pie', 'pi', { tools: [''] })).success).toBe(false);
    const { approval: _approval, ...missing } = programWorker('oc', 'opencode');
    expect(workerSchema.safeParse(missing).success).toBe(false);
    expect(workerSchema.safeParse(programWorker('cc', 'claude', { timeoutMs: 7_200_000 })).success).toBe(true);
  });

  it('QA32-E5 a run that passes its time limit is killed, and says so', { timeout: 20_000 }, async () => {
    const started = Date.now();
    const end = await runProgram({ command: process.execPath, args: ['-e', 'console.log("so far"); setInterval(() => {}, 1000)'] }, process.cwd(), 300, new AbortController().signal);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(end).toMatchObject({ timedOut: true, startError: null, stdout: 'so far\n' });
    expect(runResult({ name: 'cc', kind: 'claude', timeoutMs: 120_000 }, end)).toEqual({ text: 'cc timed out after 120 s\nso far', isError: true });
  });

  it('QA32-E17 a program starts in its own process group on Linux and macOS, and its tree is killed as each OS does', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      expect(programSpawn(platform, '/work', { A: '1' })).toEqual({ cwd: '/work', env: { A: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true });
      expect(treeKill(platform, 42)).toEqual({ kind: 'group', pid: 42 });
    }
    expect(programSpawn('win32', 'C:\\work', {})).toMatchObject({ detached: false, windowsHide: true });
    expect(treeKill('win32', 42)).toEqual({ kind: 'taskkill', program: 'taskkill', args: ['/PID', '42', '/T', '/F'] });
  });
});
