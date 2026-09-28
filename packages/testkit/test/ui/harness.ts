import { fileURLToPath } from 'node:url';
import { jsonSchema, type Json } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { installFixture } from '../install/fixture-snapshots.ts';
import { openInstallFixture, type InstallFixture } from '../install/harness.ts';
import { grantsOf } from '../workspaces/harness.ts';
import board from './fixtures/extensions/board.ts';
import boardV2 from './fixtures/extensions/board-v2.ts';
import boardGoneGroup from './fixtures/extensions/board-gone-group.ts';
import chain1 from './fixtures/extensions/chain-1.ts';
import chain2 from './fixtures/extensions/chain-2.ts';
import chain3 from './fixtures/extensions/chain-3.ts';
import chain4 from './fixtures/extensions/chain-4.ts';
import chain5 from './fixtures/extensions/chain-5.ts';
import chain6 from './fixtures/extensions/chain-6.ts';
import chain7 from './fixtures/extensions/chain-7.ts';
import chain8 from './fixtures/extensions/chain-8.ts';
import chain9 from './fixtures/extensions/chain-9.ts';
import filesA from './fixtures/extensions/files-a.ts';
import filesB from './fixtures/extensions/files-b.ts';
import kit from './fixtures/extensions/kit.ts';
import kitPrivateCard from './fixtures/extensions/kit-private-card.ts';
import kitShopSecret from './fixtures/extensions/kit-shop-secret.ts';
import kitToolbarTray from './fixtures/extensions/kit-toolbar-tray.ts';
import kitV2 from './fixtures/extensions/kit-v2.ts';
import kitV3 from './fixtures/extensions/kit-v3.ts';
import loopA from './fixtures/extensions/loop-a.ts';
import loopB from './fixtures/extensions/loop-b.ts';
import shop from './fixtures/extensions/shop.ts';
import shopActionRead from './fixtures/extensions/shop-action-read.ts';
import shopBadCount from './fixtures/extensions/shop-bad-count.ts';
import shopClash from './fixtures/extensions/shop-clash.ts';
import shopLite from './fixtures/extensions/shop-lite.ts';
import shopNoTitle from './fixtures/extensions/shop-no-title.ts';
import shopQueryRead from './fixtures/extensions/shop-query-read.ts';
import shopRendererRead from './fixtures/extensions/shop-renderer-read.ts';
import shopSlotRead from './fixtures/extensions/shop-slot-read.ts';
import shopToolbar from './fixtures/extensions/shop-toolbar.ts';
import twin from './fixtures/extensions/twin.ts';

// Runtimes with worker threads and a real home folder.
export const uiTests = { timeout: 120_000 } as const;

const folder = fileURLToPath(new URL('./fixtures/extensions/', import.meta.url));

type UiBuild = { definition: ExtensionDefinition; entry: string; version?: string };

export const uiBuilds = {
  board: { definition: board, entry: 'board.ts' },
  'board-v2': { definition: boardV2, entry: 'board-v2.ts', version: '2.0.0' },
  'board-gone-group': { definition: boardGoneGroup, entry: 'board-gone-group.ts', version: '3.0.0' },
  kit: { definition: kit, entry: 'kit.ts' },
  shop: { definition: shop, entry: 'shop.ts' },
  'shop-lite': { definition: shopLite, entry: 'shop-lite.ts' },
  'shop-toolbar': { definition: shopToolbar, entry: 'shop-toolbar.ts' },
  'shop-slot-read': { definition: shopSlotRead, entry: 'shop-slot-read.ts' },
  'shop-action-read': { definition: shopActionRead, entry: 'shop-action-read.ts' },
  'shop-renderer-read': { definition: shopRendererRead, entry: 'shop-renderer-read.ts' },
  'shop-query-read': { definition: shopQueryRead, entry: 'shop-query-read.ts' },
  'shop-no-title': { definition: shopNoTitle, entry: 'shop-no-title.ts' },
  'shop-bad-count': { definition: shopBadCount, entry: 'shop-bad-count.ts' },
  'shop-clash': { definition: shopClash, entry: 'shop-clash.ts' },
  'loop-a': { definition: loopA, entry: 'loop-a.ts' },
  'loop-b': { definition: loopB, entry: 'loop-b.ts' },
  twin: { definition: twin, entry: 'twin.ts' },
  'kit-private-card': { definition: kitPrivateCard, entry: 'kit-private-card.ts' },
  'kit-toolbar-tray': { definition: kitToolbarTray, entry: 'kit-toolbar-tray.ts' },
  'kit-v2': { definition: kitV2, entry: 'kit-v2.ts', version: '2.0.0' },
  'kit-v3': { definition: kitV3, entry: 'kit-v3.ts', version: '3.0.0' },
  'kit-shop-secret': { definition: kitShopSecret, entry: 'kit-shop-secret.ts', version: '2.0.0' },
  'files-a': { definition: filesA, entry: 'files-a.ts' },
  'files-b': { definition: filesB, entry: 'files-b.ts' },
  'chain-1': { definition: chain1, entry: 'chain-1.ts' },
  'chain-2': { definition: chain2, entry: 'chain-2.ts' },
  'chain-3': { definition: chain3, entry: 'chain-3.ts' },
  'chain-4': { definition: chain4, entry: 'chain-4.ts' },
  'chain-5': { definition: chain5, entry: 'chain-5.ts' },
  'chain-6': { definition: chain6, entry: 'chain-6.ts' },
  'chain-7': { definition: chain7, entry: 'chain-7.ts' },
  'chain-8': { definition: chain8, entry: 'chain-8.ts' },
  'chain-9': { definition: chain9, entry: 'chain-9.ts' },
} as const satisfies Record<string, UiBuild>;

export type UiBuildId = keyof typeof uiBuilds;

export type UiFixture = InstallFixture & { digests: Map<UiBuildId, string> };

// Workspaces A and B, each with an empty applied preset (ADR 0124), and the given builds installed with the first
// installed version active; nothing is enabled.
export async function openUiFixture(builds: readonly UiBuildId[] = ['kit', 'shop', 'loop-a', 'loop-b', 'twin'], options: { home?: string } = {}): Promise<UiFixture> {
  const fixture = await openInstallFixture(options.home === undefined ? {} : { home: options.home });
  const digests = new Map<UiBuildId, string>();
  for (const build of builds) {
    const spec: UiBuild = uiBuilds[build];
    const { definition, entry, version } = spec;
    digests.set(build, await installFixture(fixture.connection, fixture.home, { definition, folder, entry, ...(version === undefined ? {} : { version }) }));
  }
  fixture.runtime.registry.refresh();
  return { ...fixture, digests };
}

// The installed extension's active version as a preset entry enabling it, the way the preset tests build entries.
export function presetEntry(fixture: InstallFixture, name: string): Json {
  const found = fixture.connection
    .prepare('SELECT v.source, v.integrity, v.digest FROM extensions e JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest WHERE e.name = ?')
    .get(name);
  if (found === undefined) throw new Error(`${name} is not installed`);
  const integrity = found['integrity'];
  return jsonSchema.parse({
    source: String(found['source']),
    ...(typeof integrity === 'string' ? { integrity } : {}),
    digest: String(found['digest']),
    enabled: true,
    grants: JSON.parse(JSON.stringify(grantsOf(fixture, name))),
  });
}
