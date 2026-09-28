import { llmDefaultsSchema, type LlmDefaults } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';

export const globalDefaultsKey = 'llm.defaults';

// 03 §3.12: workspace defaults live in the applied preset's `llm.defaults`, global ones in the kernel_settings row
// `llm.defaults`; either is `{}` when unset.
export function workspaceDefaults(connection: Connection, workspaceId: string | undefined): LlmDefaults {
  if (workspaceId === undefined) return {};
  return readAppliedPreset({ connection }, workspaceId)?.preset.llm?.defaults ?? {};
}

export function globalDefaults(connection: Connection): LlmDefaults {
  const row = connection.prepare('SELECT value FROM kernel_settings WHERE key = ?').get(globalDefaultsKey);
  return row === undefined ? {} : llmDefaultsSchema.parse(JSON.parse(String(row['value'])));
}
