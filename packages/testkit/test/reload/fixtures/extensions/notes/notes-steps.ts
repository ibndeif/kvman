import type { Json, JsonObject } from '@kvman/protocol';
import type { MigrationContext } from '@kvman/sdk';

function wrapped(value: Json): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && value['v'] === 2;
}

// Step 2 of Notes: `text` becomes `title`, kv values are wrapped, log entries marked, and `old:` keys removed. Each
// replacement carries the order it was visited in; a second pass proves each() sees the committed values, and the
// config read after a write sees the write (ADR 0143).
export async function renameItems(m: MigrationContext): Promise<string[]> {
  const workspaces = new Set<string>();
  let order = 0;
  await m.collection('items').each(({ workspaceId, doc }) => {
    if (workspaceId !== null) workspaces.add(workspaceId);
    order += 1;
    return { id: String(doc['id']), title: String(doc['text'] ?? doc['title']), order };
  });
  order = 0;
  await m.kv.each(({ key, value }) => {
    order += 1;
    return key.startsWith('old:') ? m.remove : { v: 2, value, order };
  });
  await m.kv.each(({ key, value }) => {
    if (wrapped(value)) throw new Error(`each saw its own write at ${key}`);
    return undefined;
  });
  for (const log of ['history:*', 'audit']) {
    order = 0;
    await m.log<JsonObject>(log).each(({ value }) => {
      order += 1;
      return { ...value, v: 2, order };
    });
  }
  const global = (await m.config.get('global')) ?? {};
  m.config.set('global', { ...global, migrated: true });
  if ((await m.config.get('global'))?.['migrated'] !== true) throw new Error('config.get did not see the write');
  return [...workspaces];
}

export async function breakStep(): Promise<void> {
  throw new Error('the migration broke');
}

// Step 3 of Notes 3.0.0: fails while the stored global config says so.
export async function blockedStep(m: MigrationContext): Promise<void> {
  if ((await m.config.get('global'))?.['blockStep3'] === true) throw new Error('step 3 is blocked');
}
