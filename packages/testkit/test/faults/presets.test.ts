import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPreviewSchema, commandAcceptedResponseSchema, commandReplyResponseSchema, messageStatusSchema,
  presetImportPreviewResultSchema, presetImportResultSchema, queryResponseSchema, stageResultSchema,
  type Json, type MessageStatus,
} from '@kvman/protocol';
import { describe, expect, it, vi } from 'vitest';
import { command, send } from '../adapters/http-client.ts';
import { launchKernel, temporaryHome, type ChildKernel } from '../child-kernel/launch.ts';
import { fixtureWorkspace } from '../child-kernel/workspace.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { integrityOf, pdfGrants, presetP, startPresetRegistry } from '../presets/harness.ts';
import { jsonSchema, presetChangedSchema, presetSchema } from '@kvman/protocol';
import { unanswered } from '../reload/child-harness.ts';
import { inspect, messagesOf, type MessageRow } from './ledger-database.ts';

// M2.8: preset apply crashes run real pnpm installs in the child kernel, like the preset tests.
const presetFaultTests = { timeout: 180_000 } as const;

const workspaceB = 'b'.repeat(64);

const terminalStates = ['done', 'failed', 'dead', 'cancelled'];

type CommandReply = { id: string; reply: Json };

async function settled(port: number, id: string): Promise<MessageStatus> {
  return vi.waitFor(async () => {
    const status = messageStatusSchema.parse((await send(port, 'GET', `/api/v1/messages/${id}`)).json);
    expect(terminalStates, `${status.type} ${id} is ${status.state}`).toContain(status.state);
    return status;
  }, { timeout: 120_000, interval: 100 });
}

// A command as the person sends it over HTTP, waiting for its reply however long the kernel takes.
async function runCommand(port: number, type: string, payload: Json, extra: Record<string, unknown> = {}): Promise<CommandReply> {
  const answer = await command(port, type, payload, { wait: 60_000, ...extra });
  if (answer.status === 200) {
    const { id, reply } = commandReplyResponseSchema.parse(answer.json);
    return { id, reply };
  }
  if (answer.status === 202) {
    const { id } = commandAcceptedResponseSchema.parse(answer.json);
    const status = await settled(port, id);
    if (status.state === 'done' && status.reply !== undefined) return { id, reply: status.reply };
    throw new Error(`${type} ended ${status.state}: ${JSON.stringify(status.problem)}`);
  }
  throw new Error(`${type} was refused: ${answer.text}`);
}

async function runQuery(port: number, type: string, payload: Json): Promise<Json> {
  const answer = await send(port, 'POST', `/api/v1/queries/${type}`, { body: { payload } });
  if (answer.status !== 200) throw new Error(`${type} failed: ${answer.text}`);
  return queryResponseSchema.parse(answer.json).data;
}

async function importPreset(port: number, json: Json): Promise<string> {
  const previewed = presetImportPreviewResultSchema.parse(await runQuery(port, 'kernel.preset.import.preview', { json }));
  const { reply } = await runCommand(port, 'kernel.preset.import', { confirmationToken: previewed.confirmationToken });
  return presetImportResultSchema.parse(reply).presetId;
}

// The redelivered command of a kernel killed mid-apply, once it reached its terminal state after the restart.
async function failedApply(home: string): Promise<MessageRow> {
  return vi.waitFor(() => {
    const found = inspect(home, (connection) => messagesOf(connection, 'kernel.preset.apply'));
    expect(found).toHaveLength(1);
    const [row] = found;
    if (row === undefined) throw new Error('no apply message');
    expect(row.state).toBe('failed');
    return row;
  }, { timeout: 60_000, interval: 100 });
}

function appliedOf(home: string, workspaceId: string): { revision: number; preset: Json } {
  return inspect(home, (connection) => {
    const row = connection.prepare('SELECT preset, revision FROM workspace_presets WHERE workspace_id = ?').get(workspaceId);
    if (row === undefined) throw new Error(`workspace ${workspaceId} has no applied preset`);
    return { revision: Number(row['revision']), preset: jsonSchema.parse(JSON.parse(String(row['preset']))) };
  });
}

async function withRegistry<Result>(run: (registry: LocalRegistry) => Promise<Result>): Promise<Result> {
  const registry = await startPresetRegistry();
  try {
    return await run(registry);
  } finally {
    await registry.close();
  }
}

describe('crashes around a preset apply (plan 14 §14.3, invariants 1–4)', presetFaultTests, () => {
  it('M2.8-E49 crashing after the stage leaves nothing staged and the redelivered apply expires', async () => {
    await withRegistry(async (registry) => {
      const home = temporaryHome();
      const kernel = await launchKernel({
        home, fixture: 'presets', faults: 'preset.apply.after-stage',
        environment: { KVMAN_NPM_REGISTRY: registry.url },
      });
      let restarted: ChildKernel | undefined;
      try {
        const integrity = await integrityOf('@acme/pdf', '1.0.0');
        expect(await importPreset(kernel.port, jsonSchema.parse(presetP(integrity)))).toBe('pdf-app');
        const staged = await runCommand(kernel.port, 'kernel.preset.apply.stage', { workspaceId: fixtureWorkspace, presetId: 'pdf-app' });
        const preview = applyPreviewSchema.parse(staged.reply);
        await unanswered(command(kernel.port, 'kernel.preset.apply', { confirmationToken: preview.confirmationToken }, { wait: 60_000 }));
        expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
        restarted = await launchKernel({
          home, fixture: 'presets', environment: { KVMAN_NPM_REGISTRY: registry.url },
        });
        const staging = join(home, 'extensions', 'staging');
        for (const entry of existsSync(staging) ? readdirSync(staging) : []) {
          expect(existsSync(join(staging, entry, 'tree')), `${entry} holds a tree`).toBe(false);
        }
        expect(inspect(home, (connection) => connection.prepare("SELECT digest FROM extension_versions WHERE name = '@acme/pdf'").all())).toEqual([]);
        const applied = appliedOf(home, fixtureWorkspace);
        expect(applied.revision).toBe(1);
        expect(applied.preset).toMatchObject({ id: 'test', extensions: {} });
        const row = await failedApply(home);
        expect(row.result).toMatchObject({ ok: false, problem: { code: 'CONFIRMATION_EXPIRED' } });
        expect(inspect(home, (connection) => connection.prepare("SELECT count(*) AS count FROM presets WHERE id = 'pdf-app'").get())?.['count']).toBe(1);
        const stages = inspect(home, (connection) => messagesOf(connection, 'kernel.preset.apply.stage'));
        expect(stages).toHaveLength(1);
        expect(stages[0]).toMatchObject({ state: 'done' });
        const changed = inspect(home, (connection) => connection
          .prepare("SELECT payload FROM events WHERE type = 'kernel.preset.changed' AND workspace_id = ?").all(fixtureWorkspace)
          .map((event) => presetChangedSchema.parse(JSON.parse(String(event['payload']))).cause));
        expect(changed.filter((cause) => cause === 'apply')).toEqual([]);
        expect(await restarted.stop()).toEqual({ code: 0, signal: null });
        restarted = undefined;
      } finally {
        await kernel.stop();
        if (restarted !== undefined) await restarted.stop();
      }
    });
  });

  it('M2.8-E50 crashing after a version switch keeps the switch and expires the redelivered apply', async () => {
    await withRegistry(async (registry) => {
      const home = temporaryHome();
      const kernel = await launchKernel({
        home, fixture: 'presets', faults: 'preset.apply.after-version-switch',
        environment: { KVMAN_NPM_REGISTRY: registry.url },
      });
      let restarted: ChildKernel | undefined;
      try {
        const first = await integrityOf('@acme/pdf', '1.0.0');
        expect(await importPreset(kernel.port, jsonSchema.parse(presetP(first)))).toBe('pdf-app');
        const staged = stageResultSchema.parse((await runCommand(kernel.port, 'kernel.extension.stage', { source: 'npm:@acme/pdf@1.0.0' })).reply);
        await runCommand(kernel.port, 'kernel.extension.install', { confirmationToken: staged.confirmationToken });
        await runCommand(
          kernel.port,
          'kernel.extension.enable',
          jsonSchema.parse({ workspaceId: workspaceB, name: '@acme/pdf', grants: pdfGrants('1.0.0') }),
          { workspaceId: workspaceB },
        );
        const next = await integrityOf('@acme/pdf', '1.1.0');
        expect(await importPreset(kernel.port, jsonSchema.parse(presetP(next, {
          id: 'pdf-app-2', name: 'PDF App 2',
          extensions: { '@acme/pdf': { source: 'npm:@acme/pdf@1.1.0', integrity: next, enabled: true, grants: pdfGrants('1.1.0') } },
        })))).toBe('pdf-app-2');
        const preview = applyPreviewSchema.parse((await runCommand(
          kernel.port, 'kernel.preset.apply.stage', { workspaceId: fixtureWorkspace, presetId: 'pdf-app-2' },
        )).reply);
        await unanswered(command(kernel.port, 'kernel.preset.apply', { confirmationToken: preview.confirmationToken }, { wait: 60_000 }));
        expect(await kernel.exited).toEqual({ code: null, signal: 'SIGKILL' });
        restarted = await launchKernel({
          home, fixture: 'presets', environment: { KVMAN_NPM_REGISTRY: registry.url },
        });
        const pdf = inspect(home, (connection) => {
          const active = String(connection.prepare("SELECT active_digest FROM extensions WHERE name = '@acme/pdf'").get()?.['active_digest']);
          const version = connection.prepare("SELECT digest FROM extension_versions WHERE name = '@acme/pdf' AND source = 'npm:@acme/pdf@1.1.0'").get();
          const entry = presetSchema.parse(JSON.parse(String(
            connection.prepare('SELECT preset FROM workspace_presets WHERE workspace_id = ?').get(workspaceB)?.['preset'],
          ))).extensions['@acme/pdf'];
          return { active, digest: String(version?.['digest']), entry };
        });
        expect(pdf.active).toBe(pdf.digest);
        expect(pdf.entry).toEqual({
          source: 'npm:@acme/pdf@1.1.0', integrity: next, digest: pdf.digest, enabled: true, grants: pdfGrants('1.1.0'),
        });
        const applied = appliedOf(home, fixtureWorkspace);
        expect(applied.revision).toBe(1);
        expect(applied.preset).toMatchObject({ id: 'test', extensions: {} });
        const row = await failedApply(home);
        expect(row.result).toMatchObject({ ok: false, problem: { code: 'CONFIRMATION_EXPIRED' } });
        expect(inspect(home, (connection) => connection.prepare('SELECT count(*) AS count FROM presets WHERE id IN (\'pdf-app\', \'pdf-app-2\')').get())?.['count']).toBe(2);
        expect(inspect(home, (connection) => connection
          .prepare("SELECT count(*) AS count FROM events WHERE type = 'kernel.extension.reloaded' AND workspace_id = ?").get(workspaceB))?.['count']).toBe(1);
        expect(await restarted.stop()).toEqual({ code: 0, signal: null });
        restarted = undefined;
      } finally {
        await kernel.stop();
        if (restarted !== undefined) await restarted.stop();
      }
    });
  });
});
