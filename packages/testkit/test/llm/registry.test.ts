import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { writeCatalogPreset } from '@kvman/kernel';
import { jsonSchema, presetSchema, validateResultSchema, type Json } from '@kvman/protocol';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, extensionActor, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { disable, enable, eventsOf, grantsOf, query, rows, valueOf } from '../workspaces/harness.ts';
import { installFakeProvider, llmTests, refreshWait, openLlmFixture, waitForFakeModel } from './harness.ts';
import twin from './fixtures/extensions/twin.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openLlmFixture();
  return fixture;
}

function modelRows(current: InstallFixture, provider: string): Array<{ id: string; source: string; extension: string }> {
  return rows(current, 'SELECT id, source, extension FROM llm_models WHERE provider = ? ORDER BY id', provider)
    .map((row) => ({ id: String(row['id']), source: String(row['source']), extension: String(row['extension']) }));
}

async function listedModels(current: InstallFixture, workspaceId: string): Promise<unknown> {
  return query(current, 'kernel.llm.models.list', { workspaceId }, person);
}

async function setListerConfig(current: InstallFixture, value: Json, revision: number): Promise<void> {
  valueOf(await command(current, 'kernel.config.set', { extension: '@acme/lister-llm', scope: 'global', value, revision }));
}

// The installed fixture's active version as a preset entry enabling it, the way the preset tests build entries.
function presetEntry(current: InstallFixture, name: string): Json {
  const found = current.connection
    .prepare('SELECT v.source, v.integrity, v.digest FROM extensions e JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest WHERE e.name = ?')
    .get(name);
  if (found === undefined) throw new Error(`${name} is not installed`);
  const integrity = found['integrity'];
  return jsonSchema.parse({
    source: String(found['source']),
    ...(typeof integrity === 'string' ? { integrity } : {}),
    digest: String(found['digest']),
    enabled: true,
    grants: JSON.parse(JSON.stringify(grantsOf(current, name))),
  });
}

describe('LLM registry (plan 03 §3.12, ADR 0152)', llmTests, () => {
  it('M2.9-E17 enabling a provider extension stores its static and listed models', async () => {
    const current = await opened();
    await setListerConfig(current, { listed: [{ id: 'lister-a', title: 'Lister A' }] }, 0);
    await vi.waitFor(() => {
      expect(modelRows(current, 'lister')).toEqual([
        { id: 'lister-a', source: 'listed', extension: '@acme/lister-llm' },
        { id: 'lister-static', source: 'static', extension: '@acme/lister-llm' },
      ]);
    }, refreshWait);
    valueOf(await enable(current, workspaceA, '@acme/lister-llm'));
    await vi.waitFor(() => {
      expect(modelRows(current, 'lister')).toHaveLength(2);
    }, refreshWait);
    expect(await listedModels(current, workspaceA)).toEqual({
      ok: true,
      value: [
        expect.objectContaining({ provider: 'lister', id: 'lister-a', extension: '@acme/lister-llm', source: 'listed' }),
        expect.objectContaining({ provider: 'lister', id: 'lister-static', extension: '@acme/lister-llm', source: 'static' }),
      ],
    });
    expect(await listedModels(current, workspaceB)).toEqual({ ok: true, value: [] });
    expect(eventsOf(current, 'kernel.llm.models.changed')).toEqual([{ workspaceId: null, payload: { provider: 'lister' } }]);
  });

  it('M2.9-E18 a config write refreshes the models; a failing refresh keeps the rows and warns', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/lister-llm'));
    await vi.waitFor(() => {
      expect(modelRows(current, 'lister')).toEqual([{ id: 'lister-static', source: 'static', extension: '@acme/lister-llm' }]);
    }, refreshWait);
    await setListerConfig(current, { listed: [{ id: 'lister-a', title: 'Lister A' }, { id: 'lister-b', title: 'Lister B' }] }, 0);
    await vi.waitFor(() => {
      expect(modelRows(current, 'lister').map((row) => row.id)).toEqual(['lister-a', 'lister-b', 'lister-static']);
    }, refreshWait);
    expect(eventsOf(current, 'kernel.llm.models.changed')).toHaveLength(2);
    await setListerConfig(current, { listed: [{ id: 'lister-a', title: 'Lister A' }, { id: 'lister-b', title: 'Lister B' }], failList: true }, 1);
    valueOf(await command(current, 'kernel.llm.models.refresh', { provider: 'lister' }));
    expect(modelRows(current, 'lister').map((row) => row.id)).toEqual(['lister-a', 'lister-b', 'lister-static']);
    valueOf(await command(current, 'kernel.llm.models.refresh', { provider: 'lister' }));
    expect(eventsOf(current, 'kernel.llm.models.changed')).toHaveLength(2);
    const warnings = current.logged.filter((record) => record.level === 'warn' && record.message === 'listing the models of a provider failed');
    expect(warnings.length).toBeGreaterThan(0);
    for (const warning of warnings) expect(warning.fields).toEqual({ provider: 'lister' });
    const denied = problemOf(await command(current, 'kernel.llm.models.refresh', {}, extensionActor('@acme/asker'), workspaceA));
    expect(denied).toMatchObject({ code: 'CAPABILITY_DENIED' });
  });

  it('M2.9-E19 uninstalling a provider extension deletes its model rows, also when it keeps data', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/lister-llm'));
    await vi.waitFor(() => {
      expect(modelRows(current, 'lister')).toHaveLength(1);
    }, refreshWait);
    valueOf(await disable(current, workspaceA, '@acme/lister-llm'));
    valueOf(await command(current, 'kernel.extension.uninstall', { name: '@acme/lister-llm' }));
    expect(rows(current, 'SELECT id FROM llm_models')).toEqual([]);
    expect(await listedModels(current, workspaceA)).toEqual({ ok: true, value: [] });
  });

  // The M2.9 row names Fake here; Fake is the next slice's fake provider, so Lister stands in as the configured one.
  it('M2.9-E20 providers.list reports each enabled provider with whether its status is configured', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/lister-llm'));
    valueOf(await enable(current, workspaceA, '@acme/broken'));
    await vi.waitFor(() => {
      expect(modelRows(current, 'lister')).toHaveLength(1);
      expect(modelRows(current, 'broken')).toHaveLength(1);
    }, refreshWait);
    expect(await query(current, 'kernel.llm.providers.list', { workspaceId: workspaceA }, person)).toEqual({
      ok: true,
      value: [
        { id: 'broken', title: 'Broken', extension: '@acme/broken', auth: 'none', configured: false },
        { id: 'lister', title: 'Lister', extension: '@acme/lister-llm', auth: 'none', configured: true },
      ],
    });
  });

  it('M2.9-E22 two extensions providing fake conflict on enable, stage, and validate', async () => {
    const current = fixture = await opened();
    await installFakeProvider(current, {});
    valueOf(await enable(current, workspaceA, '@kvman/fake-provider'));
    await waitForFakeModel(current);
    await installFixture(current.connection, current.home, {
      definition: twin, folder: fileURLToPath(new URL('./fixtures/extensions/', import.meta.url)), entry: 'twin.ts',
    });
    current.runtime.registry.refresh();

    const clash = problemOf(await enable(current, workspaceA, '@acme/twin'));
    expect(clash.code).toBe('PROVIDER_CONFLICT');
    expect(clash.detail ?? '').toContain('@kvman/fake-provider');
    expect(clash.detail ?? '').toContain('@acme/twin');

    // The fixtures' sources are local:, which an import refuses as unshareable, so the preset is a catalog row staged
    // by id: stage runs the enabled-set checks on it all the same (ADR 0148).
    writeCatalogPreset(current.connection, presetSchema.parse({
      presetVersion: 1, id: 'fake-twin', name: 'Fake Twin', revision: 1, app: { title: 'Fake Twin', home: '/' },
      extensions: {
        '@kvman/fake-provider': presetEntry(current, '@kvman/fake-provider'),
        '@acme/twin': presetEntry(current, '@acme/twin'),
      },
    }), false, current.timers.time.value);
    const staged = problemOf(await command(current, 'kernel.preset.apply.stage', { workspaceId: workspaceA, presetId: 'fake-twin' }));
    expect(staged.code).toBe('PROVIDER_CONFLICT');
    expect(staged.detail ?? '').toContain('@kvman/fake-provider');
    expect(staged.detail ?? '').toContain('@acme/twin');

    const manifest = current.runtime.registry.current().manifestOf('@acme/twin');
    if (manifest === undefined) throw new Error('@acme/twin is not installed');
    const answer = await query(current, 'kernel.validate', { workspaceId: workspaceA, manifest: jsonSchema.parse(manifest) }, person);
    if (typeof answer !== 'object' || answer === null || !('value' in answer)) throw new Error('kernel.validate did not answer');
    const validated = validateResultSchema.parse(answer.value);
    expect(validated.ok).toBe(false);
    if (validated.ok) throw new Error('twin was expected to conflict with fake');
    expect(validated.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'extensions.@acme/twin', message: expect.stringContaining('fake') }),
    ]));
  });
});
