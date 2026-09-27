import { compareByCodePoint, presetSchema, type Preset, type PresetListing } from '@kvman/protocol';
import type { Connection } from './driver.ts';

// 07 §7.4, ADR 0149: the preset catalog rows.
export function readCatalogPreset(connection: Connection, presetId: string): { preset: Preset; builtin: boolean } | undefined {
  const row = connection.prepare('SELECT doc, builtin FROM presets WHERE id = ?').get(presetId);
  if (row === undefined) return undefined;
  return { preset: presetSchema.parse(JSON.parse(String(row['doc']))), builtin: Number(row['builtin']) === 1 };
}

// 07 §7.4, ADR 0149: the catalog listed by name, then by id.
export function listCatalog(connection: Connection): PresetListing[] {
  const listings = connection
    .prepare('SELECT id, doc, builtin, revision FROM presets')
    .all()
    .map((row) => {
      const preset = presetSchema.parse(JSON.parse(String(row['doc'])));
      const listing: PresetListing = {
        id: String(row['id']),
        name: preset.name,
        ...(preset.description === undefined ? {} : { description: preset.description }),
        ...(preset.icon === undefined ? {} : { icon: preset.icon }),
        builtin: Number(row['builtin']) === 1,
        revision: Number(row['revision']),
      };
      return listing;
    });
  listings.sort((left, right) => compareByCodePoint(left.name, right.name) || compareByCodePoint(left.id, right.id));
  return listings;
}

// ADR 0146: a catalog row written whole; seeding and tests write through it.
export function writeCatalogPreset(connection: Connection, preset: Preset, builtin: boolean, updatedAt: number): void {
  connection
    .prepare(`INSERT INTO presets (id, doc, builtin, revision, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, builtin = excluded.builtin, revision = excluded.revision, updated_at = excluded.updated_at`)
    .run(preset.id, JSON.stringify(preset), builtin ? 1 : 0, preset.revision, updatedAt);
}
