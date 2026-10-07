import { existsSync } from 'node:fs';
import path from 'node:path';
import { z, type Json } from '@kvman/sdk';
import { openConnection } from '../storage/database.ts';
import { globalScope } from '../store/store.ts';

// The stored `kernel.language` (plan 14 §14.2), for what a run says before its settings exist: the global value, else
// the preset's, else `en`. It isn't checked against the catalogs, which aren't loaded yet. A home with no database is
// left without one.

const language = z.string();

function globalValue(home: string): unknown {
  const file = path.join(home, 'kvman.db');
  if (!existsSync(file)) return undefined;
  const connection = openConnection(file);
  try {
    const row = connection.prepare<[string, string], { value: string }>('SELECT value FROM settings WHERE key = ? AND scope = ?').get('kernel.language', globalScope);
    return row === undefined ? undefined : JSON.parse(row.value);
  } finally {
    connection.close();
  }
}

export function storedLanguage(home: string, presetSettings: Readonly<Record<string, Json>>): string {
  for (const candidate of [globalValue(home), presetSettings['kernel.language']]) {
    const parsed = language.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return 'en';
}
