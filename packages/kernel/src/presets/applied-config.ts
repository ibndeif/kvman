import { jsonSchema, type Preset } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// 04 §4.7: the applied copy holds no config; current.get rebuilds it from the workspace's config rows.
export function presetWithConfig(connection: Connection, workspaceId: string, preset: Preset): Preset {
  const rows = connection.prepare('SELECT extension, value FROM workspace_config WHERE workspace_id = ?').all(workspaceId);
  const config = Object.fromEntries(
    rows
      .map((row) => [String(row['extension']), jsonSchema.parse(JSON.parse(String(row['value'])))] as const)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  if (Object.keys(config).length === 0) {
    const copy = { ...preset };
    delete copy.config;
    return copy;
  }
  return { ...preset, config };
}

// 07 §7.4, ADR 0149: shared presets never carry local digests; only applied copies and current.get have them.
export function withoutDigests(preset: Preset): Preset {
  const extensions = Object.fromEntries(
    Object.entries(preset.extensions).map(([name, entry]) => {
      const copy = { ...entry };
      delete copy.digest;
      return [name, copy];
    }),
  );
  return { ...preset, extensions };
}
