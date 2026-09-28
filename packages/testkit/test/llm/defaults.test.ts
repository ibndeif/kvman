import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, extensionActor, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { enable, eventsOf, openFolderAsWorkspace, presetRow, query, rows, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import { llmTests, refreshWait, openLlmFixture } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

const staticModel = { provider: 'lister', id: 'lister-static' };

describe('LLM defaults (plan 03 §3.12, ADR 0152)', llmTests, () => {
  it('M2.9-E21 defaults.set writes workspace and global defaults with their events', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/lister-llm'));
    await vi.waitFor(() => {
      expect(rows(current, 'SELECT id FROM llm_models WHERE provider = ?', 'lister')).toHaveLength(1);
    }, refreshWait);
    expect(presetRow(current, workspaceA).revision).toBe(2);

    valueOf(await command(current, 'kernel.llm.defaults.set', { workspaceId: workspaceA, purpose: 'chat', model: staticModel }));
    expect(presetRow(current, workspaceA).revision).toBe(3);
    expect(eventsOf(current, 'kernel.preset.changed').at(-1)).toEqual(
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA, revision: 3, cause: 'update' } },
    );
    expect(eventsOf(current, 'kernel.llm.defaults.changed')).toEqual([{ workspaceId: workspaceA, payload: { workspaceId: workspaceA } }]);

    valueOf(await command(current, 'kernel.llm.defaults.set', { purpose: 'summary', model: staticModel }));
    const [settings] = rows(current, "SELECT value FROM kernel_settings WHERE key = 'llm.defaults'");
    expect(JSON.parse(String(settings?.['value']))).toEqual({ summary: staticModel });
    expect(eventsOf(current, 'kernel.llm.defaults.changed')).toEqual([
      { workspaceId: workspaceA, payload: { workspaceId: workspaceA } },
      { workspaceId: null, payload: {} },
    ]);

    valueOf(await command(current, 'kernel.llm.defaults.set', { workspaceId: workspaceA, purpose: 'chat', model: null }));
    expect(problemOf(await command(current, 'kernel.llm.defaults.set', { workspaceId: workspaceA, purpose: 'chat', model: { provider: 'lister', id: 'nope' } })))
      .toMatchObject({ code: 'LLM_MODEL_NOT_FOUND' });
    const bare = await openFolderAsWorkspace(current, temporaryFolder('workspace'));
    expect(problemOf(await command(current, 'kernel.llm.defaults.set', { workspaceId: bare, purpose: 'chat', model: staticModel })))
      .toMatchObject({ code: 'PRESET_REQUIRED' });
    expect(problemOf(await command(current, 'kernel.llm.defaults.set', { workspaceId: workspaceA, purpose: 'chat', model: staticModel }, extensionActor('@acme/asker'), workspaceA)))
      .toMatchObject({ code: 'CAPABILITY_DENIED' });

    expect(await query(current, 'kernel.llm.defaults.get', { workspaceId: workspaceA }, person)).toEqual({
      ok: true,
      value: { workspace: {}, global: { summary: staticModel }, effective: { summary: staticModel } },
    });
  });
});

async function opened(): Promise<InstallFixture> {
  fixture = await openLlmFixture();
  return fixture;
}
