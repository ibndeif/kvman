import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { secretsFileSchema } from '@kvman/protocol';
import { describe, expect, it, vi } from 'vitest';
import { command } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome } from '../child-kernel/launch.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import { faultTests } from './crash-harness.ts';
import { inspect } from './ledger-database.ts';

function secretsIn(home: string): Record<string, string> {
  return secretsFileSchema.parse(JSON.parse(readFileSync(join(home, 'secrets.json'), 'utf8')));
}

// A request to a kernel killed while it answers ends without a reply.
async function unanswered(request: Promise<unknown>): Promise<void> {
  await request.then(() => undefined, () => undefined);
}

const workspaceTables = [
  ['kv', 'ws'], ['docs', 'ws'], ['logs', 'ws'], ['blob_refs', 'ws'], ['messages', 'workspace_id'], ['events', 'workspace_id'], ['llm_usage', 'ws'],
  ['workspace_presets', 'workspace_id'], ['workspace_config', 'workspace_id'], ['notifications', 'ws'], ['workspaces', 'id'],
] as const;

describe('crashes around secrets and forget (plan 14 §14.3, invariants 10 and 13)', faultTests, () => {
  it('M2.3-E50 secrets.after-commit-before-file: the file parses and keeps the value from before the set', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'desk', faults: 'secrets.after-commit-before-file@2' });
    const set = (value: string) => command(kernel.port, 'kernel.secret.set', { extension: '@acme/desk', name: 'apiKey', value }, { wait: 10_000 });
    expect((await set('before-0123456789')).status).toBe(200);
    await unanswered(set('after-0123456789'));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    expect(secretsIn(home)).toEqual({ '@acme/desk/apiKey': 'before-0123456789' });
    const restarted = await launchKernel({ home, fixture: 'desk' });
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
    expect(secretsIn(home)).toEqual({ '@acme/desk/apiKey': 'before-0123456789' });
  });

  it('M2.3-E51 workspace.forget.after-cancel: the redelivered forget completes and leaves no row of the workspace', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'desk', faults: 'workspace.forget.after-cancel' });
    expect((await command(kernel.port, 'desk.ask', {})).status).toBe(202);
    const forget = { workspaceId: fixtureWorkspace };
    await unanswered(command(kernel.port, 'kernel.workspace.forget', forget, { workspaceId: undefined, idempotencyKey: 'forget-e51', wait: 10_000 }));
    expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
    const restarted = await launchKernel({ home, fixture: 'desk' });
    await vi.waitFor(async () => {
      const answer = await command(restarted.port, 'kernel.workspace.forget', forget, { workspaceId: undefined, idempotencyKey: 'forget-e51', wait: 5_000 });
      expect([answer.status, answer.json]).toEqual([200, { id: expect.any(String), reply: {} }]);
    }, { timeout: 30_000, interval: 100 });
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
    inspect(home, (connection) => {
      for (const [table, column] of workspaceTables) {
        expect(connection.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`).get(fixtureWorkspace), table).toEqual({ count: 0 });
      }
    });
  });
});
