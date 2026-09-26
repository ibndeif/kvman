import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome, type ChildKernel } from '../child-kernel/launch.ts';
import { faultTests } from '../faults/crash-harness.ts';
import { inspect } from '../faults/ledger-database.ts';
import { temporaryFolder } from '../workspaces/harness.ts';

function folderWithRules(): string {
  const folder = temporaryFolder('trusted');
  mkdirSync(join(folder, '.kvman'));
  writeFileSync(join(folder, '.kvman', 'rule.md'), 'rule');
  return folder;
}

function objectOf(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`expected an object, got ${JSON.stringify(value)}`);
  return Object.fromEntries(Object.entries(value));
}

// Opens a folder and trusts it through HTTP as the person does; its workspace id.
async function trusted(kernel: ChildKernel, mode: 'once' | 'always'): Promise<string> {
  const opened = await command(kernel.port, 'kernel.workspace.open', { path: folderWithRules() }, { workspaceId: undefined });
  const { workspaceId } = objectOf(objectOf(opened.json)['reply']);
  if (typeof workspaceId !== 'string') throw new Error('the folder was not opened');
  const preview = await send(kernel.port, 'POST', '/api/v1/queries/kernel.trust.preview', { body: { payload: { workspaceId } } });
  const { confirmationToken } = objectOf(objectOf(preview.json)['data']);
  const granted = await command(kernel.port, 'kernel.trust.grant', { confirmationToken, mode }, { workspaceId: undefined });
  expect(granted.status).toBe(200);
  return workspaceId;
}

function trustOf(home: string, workspaceId: string): unknown {
  return inspect(home, (connection) => connection.prepare('SELECT trust FROM workspaces WHERE id = ?').get(workspaceId)?.['trust']);
}

describe('boot and trust (plan 03 §3.9 step 6, 07 §7.2)', faultTests, () => {
  it('M2.5-E35 boot clears once trust and keeps always', async () => {
    const home = temporaryHome();
    const kernel = await launchKernel({ home, fixture: 'keeper' });
    const once = await trusted(kernel, 'once');
    const always = await trusted(kernel, 'always');
    expect(await kernel.stop()).toEqual({ code: 0, signal: null });
    expect([trustOf(home, once), trustOf(home, always)]).toEqual([expect.stringContaining('"once"'), expect.stringContaining('"always"')]);
    const restarted = await launchKernel({ home, fixture: 'keeper' });
    expect(await restarted.stop()).toEqual({ code: 0, signal: null });
    expect(trustOf(home, once)).toBeNull();
    expect(trustOf(home, always)).toEqual(expect.stringContaining('"always"'));
  });
});
