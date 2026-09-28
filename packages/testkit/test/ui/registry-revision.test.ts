import { readAppliedPreset } from '@kvman/kernel';
import { uiRegistrySchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { send } from '../adapters/http-client.ts';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person } from '../install/harness.ts';
import { enable, eventsOf, valueOf } from '../workspaces/harness.ts';
import { boardFixture, locale, patch, registry } from './registry-harness.ts';
import { openUiHttp } from './registry-http.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
let http: Awaited<ReturnType<typeof openUiHttp>> | undefined;
afterEach(async () => { await http?.close(); http = undefined; await fixture?.close(); fixture = undefined; });

describe('registry revision', uiTests, () => {
  it('M2.11-H1 changes only for A preset edits and enabled extension reloads', async () => {
    fixture = await boardFixture(['board', 'board-v2']);
    valueOf(await enable(fixture, workspaceB, '@acme/board'));
    http = await openUiHttp(fixture);
    const initial = (await registry(fixture)).revision;
    async function checked(port: number, revision: string): Promise<void> {
      const response = await send(port, 'GET', `/api/v1/ui?workspaceId=${workspaceA}`);
      expect(response.status).toBe(200);
      expect(response.headers.etag).toBe(`"${revision}"`);
      expect(uiRegistrySchema.parse(response.json).revision).toBe(revision);
    }
    await checked(http.port, initial);
    valueOf(await command(fixture, 'kernel.config.set', { extension: '@acme/board', scope: 'workspace', workspaceId: workspaceA, value: { columns: 3 }, revision: 0 }, person));
    expect((await registry(fixture)).revision).toBe(initial);
    await checked(http.port, initial);
    await locale(fixture, 'ar');
    expect((await registry(fixture)).revision).toBe(initial);
    await checked(http.port, initial);
    await patch(fixture, workspaceB, { hidden: ['board.add'], app: { home: '/board' } });
    expect((await registry(fixture)).revision).toBe(initial);
    await checked(http.port, initial);
    await patch(fixture, workspaceA, { hidden: ['board.add'] });
    const edited = (await registry(fixture)).revision;
    expect(edited).not.toBe(initial);
    expect(eventsOf(fixture, 'kernel.preset.changed')).toContainEqual({ workspaceId: workspaceA, payload: expect.objectContaining({ cause: 'update' }) });
    await checked(http.port, edited);
    const digest = fixture.digests.get('board-v2');
    if (digest === undefined) throw new Error('Board 2 was not installed');
    valueOf(await command(fixture, 'kernel.extension.reload', { name: '@acme/board', digest }, person));
    const reloaded = (await registry(fixture)).revision;
    expect(reloaded).not.toBe(edited);
    expect(eventsOf(fixture, 'kernel.extension.reloaded').filter((event) => event.workspaceId === workspaceA)).toHaveLength(1);
    await checked(http.port, reloaded);
  });

  it('M2.11-H4 quarantine changes the revision without writing the preset', async () => {
    fixture = await boardFixture();
    const before = await registry(fixture);
    const presetRevision = readAppliedPreset({ connection: fixture.connection }, workspaceA)?.revision;
    const events = eventsOf(fixture, 'kernel.preset.changed');
    await fixture.runtime.quarantine('@acme/board', 'HOST_FAILURES');
    const quarantined = await registry(fixture);
    expect(quarantined.revision).not.toBe(before.revision);
    expect(quarantined.pages).toEqual([]);
    expect(quarantined.components).toEqual([]);
    expect(quarantined.catalogs).toEqual({ defaults: {}, locales: [] });
    expect(quarantined.settingsSections).toEqual([]);
    expect(quarantined.extensions).toEqual({});
    expect(Object.values(quarantined.slots).flatMap((slot) => slot.items)).toEqual([]);
    expect(readAppliedPreset({ connection: fixture.connection }, workspaceA)?.revision).toBe(presetRevision);
    expect(eventsOf(fixture, 'kernel.preset.changed')).toEqual(events);
    valueOf(await command(fixture, 'kernel.extension.unquarantine', { name: '@acme/board' }, person));
    const restored = await registry(fixture);
    expect(restored.revision).not.toBe(quarantined.revision);
    expect(restored).toEqual(before);
    expect(readAppliedPreset({ connection: fixture.connection }, workspaceA)?.revision).toBe(presetRevision);
    expect(eventsOf(fixture, 'kernel.preset.changed')).toEqual(events);
  });
});
