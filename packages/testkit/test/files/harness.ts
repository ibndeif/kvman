import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceIdOf } from '@kvman/kernel';
import { trustPreviewResultSchema, type Json, type TrustPreviewResult } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import holder from '../blobs/fixtures/extensions/holder.ts';
import keeper from '../blobs/fixtures/extensions/keeper.ts';
import { applyTestPreset } from '../install/fixture-presets.ts';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { eventsOf, grantsOf, query, rows, temporaryFolder, valueOf } from '../workspaces/harness.ts';
import filer from './fixtures/extensions/filer.ts';
import reader from './fixtures/extensions/reader.ts';
import trustee from './fixtures/extensions/trustee.ts';

export const fileTests = { timeout: 60_000 } as const;

const filesFolder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));
const blobsFolder = fileURLToPath(new URL('../blobs/fixtures/extensions/', import.meta.url));

const fixtures: Array<{ definition: ExtensionDefinition; folder: string; entry: string }> = [
  { definition: filer, folder: filesFolder, entry: 'filer.ts' }, { definition: reader, folder: filesFolder, entry: 'reader.ts' },
  { definition: trustee, folder: filesFolder, entry: 'trustee.ts' }, { definition: keeper, folder: blobsFolder, entry: 'keeper.ts' },
  { definition: holder, folder: blobsFolder, entry: 'holder.ts' },
];

export type FilesFixture = InstallFixture & { root: string; workspaceId: string };

// A real folder as a workspace, with Filer, Reader, Trustee, Keeper, and Holder installed and enabled there sandboxed.
// With `homeInside`, the kvman home folder is a folder inside the workspace (M2.5-E25).
export async function openFilesFixture(options: { homeInside?: boolean } = {}): Promise<FilesFixture> {
  const root = realpathSync.native(temporaryFolder('workspace'));
  const fixture = await openInstallFixture(options.homeInside === true ? { home: join(root, 'home') } : {});
  for (const { definition, folder, entry } of fixtures) await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  const workspaceId = workspaceIdOf(root);
  applyTestPreset(fixture.connection, { workspaceId, path: root, name: basename(root) });
  fixture.runtime.registry.refresh();
  for (const { definition } of fixtures) fixture.enable(workspaceId, definition.meta.name, grantsOf(fixture, definition.meta.name));
  return { ...fixture, root, workspaceId };
}

export function writeIn(root: string, path: string, content: string | Buffer): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export async function files(fixture: FilesFixture, type: string, payload: Json): Promise<Json> {
  return valueOf(await command(fixture, type, payload, undefined, fixture.workspaceId));
}

export async function preview(fixture: FilesFixture): Promise<TrustPreviewResult> {
  const answer = await query(fixture, 'kernel.trust.preview', { workspaceId: fixture.workspaceId });
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) throw new Error(`the preview failed: ${JSON.stringify(answer)}`);
  return trustPreviewResultSchema.parse(answer.value);
}

export async function trust(fixture: FilesFixture, mode: 'once' | 'always' = 'always'): Promise<TrustPreviewResult> {
  const previewed = await preview(fixture);
  valueOf(await command(fixture, 'kernel.trust.grant', { confirmationToken: previewed.confirmationToken, mode }));
  return previewed;
}

export function trustRow(fixture: FilesFixture): unknown {
  const [row] = rows(fixture, 'SELECT trust FROM workspaces WHERE id = ?', fixture.workspaceId);
  return row?.['trust'] === null || row === undefined ? null : JSON.parse(String(row['trust']));
}

export function trustEvents(fixture: FilesFixture): Json[] {
  return eventsOf(fixture, 'kernel.trust.changed').filter((event) => event.workspaceId === fixture.workspaceId).map((event) => event.payload);
}
