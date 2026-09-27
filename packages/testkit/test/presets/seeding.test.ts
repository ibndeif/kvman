import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  insertWorkspace, ProblemError, readAppliedPreset, writeAppliedPreset,
  type LogRecord,
} from '@kvman/kernel';
import { jsonSchema, presetImportPreviewResultSchema, type Json } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { temporaryHome } from '../daemon/harness.ts';
import { bootHome, type BootedHome } from '../first-run/builtins.ts';
import { workspaceA } from '../hosts/harness.ts';
import { withHomeDatabase } from '../install/fixture-presets.ts';
import { person } from '../install/harness.ts';
import { builtinEntry, builtinPreset, copyPresetBuiltins, presetTests, writeBuiltinPresets } from './harness.ts';

// M2.8: the preset seeding tests boot real daemons on temporary homes, with fixture preset folders.
function catalogRows(booted: BootedHome): Array<Record<string, unknown>> {
  return booted.kernel.connection.prepare('SELECT id, builtin, revision FROM presets ORDER BY id').all();
}

function catalogDoc(booted: BootedHome, presetId: string): unknown {
  const row = booted.kernel.connection.prepare('SELECT doc FROM presets WHERE id = ?').get(presetId);
  return row === undefined ? undefined : JSON.parse(String(row['doc']));
}

function catalogChanged(booted: BootedHome): unknown[] {
  return booted.kernel.connection
    .prepare("SELECT payload FROM events WHERE type = 'kernel.preset.catalog.changed' ORDER BY seq")
    .all()
    .map((row) => JSON.parse(String(row['payload'])));
}

function appliedOf(booted: BootedHome, workspaceId: string): unknown {
  return readAppliedPreset({ connection: booted.kernel.connection }, workspaceId)?.preset;
}

async function importPreset(booted: BootedHome, json: Json): Promise<unknown> {
  const preview = await booted.kernel.runtime.query({ sender: person, type: 'kernel.preset.import.preview', payload: { json }, cause: undefined, workspaceId: undefined });
  if (!preview.ok) throw new Error(`the preview failed: ${preview.problem.code}`);
  const { confirmationToken } = presetImportPreviewResultSchema.parse(preview.value);
  const submission = await booted.kernel.runtime.submitCommand({ sender: person, idempotencyKey: `seed-${confirmationToken.slice(0, 8)}`, type: 'kernel.preset.import', payload: { confirmationToken } });
  if (!submission.ok) throw new Error(`the import was not admitted: ${submission.problem.code}`);
  const reply = await booted.kernel.runtime.awaitReply(submission.id);
  if (!reply.ok) throw new Error(`the import failed: ${reply.problem.code}`);
  return reply.value;
}

describe('builtin preset seeding (plan 03 §3.9, 07 §7.4, ADR 0146)', presetTests, () => {
  it('M2.8-E6 a first run seeds the bundled presets', async () => {
    const builtin = await copyPresetBuiltins();
    const alpha = builtinPreset('alpha', 'Alpha', 3, { '@acme/first': builtinEntry('@acme/first') });
    const beta = builtinPreset('beta', 'Beta', 5, { '@acme/second': builtinEntry('@acme/second') });
    writeBuiltinPresets(builtin, { alpha, beta });
    const booted = await bootHome(temporaryHome(), { builtin });
    try {
      expect(catalogRows(booted)).toEqual([
        { id: 'alpha', builtin: 1, revision: 3 },
        { id: 'beta', builtin: 1, revision: 5 },
      ]);
      expect(catalogDoc(booted, 'alpha')).toEqual(alpha);
      expect(catalogChanged(booted)).toEqual([
        { presetId: 'alpha', cause: 'seed' },
        { presetId: 'beta', cause: 'seed' },
      ]);
    } finally {
      await booted.close();
    }
  });

  it('M2.8-E7 a first run with an invalid builtin preset refuses to start', async () => {
    const builtin = await copyPresetBuiltins();
    writeBuiltinPresets(builtin, { alpha: builtinPreset('alpha', 'Alpha', 1) });
    writeFileSync(join(builtin, 'presets', 'broken.json'), 'not json at all');
    const home = temporaryHome();
    const failure = await bootHome(home, { builtin }).then((): undefined => undefined, (error: unknown) => error);
    expect(failure).toBeInstanceOf(ProblemError);
    expect(failure).toMatchObject({ problem: { code: 'PRESET_INVALID', detail: expect.stringContaining('broken.json') } });
    expect(existsSync(join(home, 'kvman.db'))).toBe(false);
    expect(existsSync(join(home, 'daemon.lock'))).toBe(false);
  });

  it('M2.8-E8 an upgrade replaces, deletes, and adds builtin presets', async () => {
    const first = await copyPresetBuiltins();
    const alpha = builtinPreset('alpha', 'Alpha', 1, { '@acme/first': builtinEntry('@acme/first') });
    writeBuiltinPresets(first, { alpha, beta: builtinPreset('beta', 'Beta', 1, { '@acme/second': builtinEntry('@acme/second') }) });
    const home = temporaryHome();
    const started = await bootHome(home, { builtin: first });
    try {
      const gamma = { presetVersion: 1, id: 'gamma', name: 'Gamma', revision: 1, app: { title: 'Gamma', home: '/' }, extensions: {} };
      expect(await importPreset(started, jsonSchema.parse(gamma))).toEqual({ presetId: 'gamma' });
    } finally {
      await started.close();
    }
    withHomeDatabase(home, (connection) => {
      insertWorkspace(connection, { workspaceId: workspaceA, path: '/w/a', name: 'A' }, 1);
      writeAppliedPreset(connection, workspaceA, alpha, 1);
      connection.prepare("UPDATE kernel_settings SET value = ? WHERE key = 'kvman.version'").run(JSON.stringify('0.0.0-0'));
    });
    const next = await copyPresetBuiltins();
    const changedAlpha = builtinPreset('alpha', 'Alpha Changed', 2, { '@acme/first': builtinEntry('@acme/first') });
    const builtinGamma = builtinPreset('gamma', 'Gamma Builtin', 1, { '@acme/second': builtinEntry('@acme/second') });
    writeBuiltinPresets(next, { alpha: changedAlpha, gamma: builtinGamma });
    writeFileSync(join(next, 'presets', 'broken.json'), 'not json at all');
    const logged: LogRecord[] = [];
    const upgraded = await bootHome(home, { builtin: next, logged });
    try {
      expect(catalogRows(upgraded)).toEqual([
        { id: 'alpha', builtin: 1, revision: 2 },
        { id: 'gamma', builtin: 1, revision: 1 },
      ]);
      expect(catalogDoc(upgraded, 'alpha')).toEqual(changedAlpha);
      expect(catalogDoc(upgraded, 'gamma')).toEqual(builtinGamma);
      expect(catalogChanged(upgraded)).toEqual([
        { presetId: 'alpha', cause: 'seed' },
        { presetId: 'beta', cause: 'seed' },
        { presetId: 'gamma', cause: 'import' },
        { presetId: 'alpha', cause: 'seed' },
        { presetId: 'gamma', cause: 'seed' },
        { presetId: 'beta', cause: 'seed' },
      ]);
      expect(appliedOf(upgraded, workspaceA)).toEqual(alpha);
      expect(logged.filter((record) => record.level === 'warn').map((record) => ({ message: record.message, fields: record.fields }))).toContainEqual({
        message: 'a built-in preset is not valid and was skipped',
        fields: { file: 'broken.json' },
      });
    } finally {
      await upgraded.close();
    }
  });

  it('M2.8-E9 a boot at the same version does not reseed', async () => {
    const builtin = await copyPresetBuiltins();
    writeBuiltinPresets(builtin, {
      alpha: builtinPreset('alpha', 'Alpha', 1, { '@acme/first': builtinEntry('@acme/first') }),
      beta: builtinPreset('beta', 'Beta', 1, { '@acme/second': builtinEntry('@acme/second') }),
    });
    const home = temporaryHome();
    const first = await bootHome(home, { builtin });
    await first.close();
    const second = await bootHome(home, { builtin });
    try {
      expect(catalogRows(second)).toEqual([
        { id: 'alpha', builtin: 1, revision: 1 },
        { id: 'beta', builtin: 1, revision: 1 },
      ]);
      expect(catalogChanged(second)).toEqual([
        { presetId: 'alpha', cause: 'seed' },
        { presetId: 'beta', cause: 'seed' },
      ]);
    } finally {
      await second.close();
    }
  });
});
