import { describe, expect, it } from 'vitest';
import {
  helpListSchema, helpTypeSchema, processesListRequestSchema, processesListResultSchema, processExitSchema, processResultSchema, rpcCallSchema, socketAnswerSchema,
  socketRequestSchema, spawnOptionsSchema,
} from '../src/index.ts';
import { expectRoundTrip } from './assertions.ts';

const blobId = 'b'.repeat(64);
const processId = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const result = { exitCode: 0, signal: null, logBlobId: blobId, tail: 'done\n', truncated: false, durationMs: 12 };

describe('processes, job tokens, and kernel.sock (plan 03 §3.7, 12 §12.4, ADRs 0139–0141)', () => {
  it('M2.6-E39 the process and socket shapes parse their examples and refuse what breaks their limits', () => {
    expectRoundTrip(spawnOptionsSchema, {
      command: 'bash', args: ['-c', 'echo hi'], cwd: 'sub', env: { X_Y: '1' }, timeoutMs: 86_400_000, stdin: 'in', logCapBytes: 104_857_600, live: 'shell.output.written:job-1',
      token: { calls: ['fs.file.get', 'todo.*'], context: { sessionId: 's1' }, delegate: true }, detached: true, onExit: 'shell.job.finish',
    });
    for (const call of [{ name: 'process.spawn', options: { command: 'true' } }, { name: 'process.wait', processId }, { name: 'process.kill', processId }]) {
      expectRoundTrip(rpcCallSchema, call);
    }
    expectRoundTrip(processResultSchema, result);
    expectRoundTrip(processExitSchema, { processId, reason: 'kernel-restart', ...result, exitCode: null, signal: 'SIGKILL' });
    expectRoundTrip(processesListRequestSchema, { extension: '@acme/runner', state: 'running', limit: 1000 });
    expectRoundTrip(processesListResultSchema, {
      items: [{ processId, extension: '@acme/runner', messageId: processId, workspaceId: 'a'.repeat(64), command: 'sleep', pid: 42, state: 'killed', detached: true, startedAt: 1, endedAt: 2, signal: 'SIGTERM', reason: 'killed', logBlobId: blobId }],
      total: 1,
    });
    expectRoundTrip(socketRequestSchema, { token: 't', op: 'command', type: 'runner.echo', payload: { text: 'hi' }, idempotencyKey: 'k', wait: 0 });
    expectRoundTrip(socketRequestSchema, { token: 't', op: 'query', type: 'runner.status', payload: {} });
    expectRoundTrip(socketRequestSchema, { token: 't', op: 'help' });
    expectRoundTrip(socketAnswerSchema, { ok: true, data: { id: processId, state: 'awaiting' } });
    expectRoundTrip(helpListSchema, { types: [{ type: 'runner.echo', kind: 'command', description: 'Echoes.' }] });
    expectRoundTrip(helpTypeSchema, { type: 'runner.status', kind: 'query', description: 'Status.', input: { type: 'object' }, markdown: '# runner.status' });

    const refused: Array<[{ safeParse(value: unknown): { success: boolean } }, unknown]> = [
      [spawnOptionsSchema, { command: 'sleep', timeoutMs: 86_400_001 }],
      [spawnOptionsSchema, { command: 'sleep', logCapBytes: 104_857_601 }],
      [spawnOptionsSchema, { command: 'sleep', live: 'runner.live' }],
      [spawnOptionsSchema, { command: 'sleep', token: { calls: ['Not A Pattern'] } }],
      [processesListRequestSchema, { limit: 1001 }],
      [socketRequestSchema, { token: 't', op: 'publish', type: 'runner.echo', payload: {} }],
      [socketRequestSchema, { op: 'command', type: 'runner.echo', payload: {} }],
    ];
    for (const [schema, value] of refused) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });
});
