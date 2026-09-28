import { compareByCodePoint, modelDefSchema, modelInfoSchema, type ModelDef, type ModelInfo } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// 04 §4.1, ADR 0152: an `llm_models` row holds one model of a provider; `info` is its ModelDef as JSON.
export type StoredModel = { id: string; extension: string; source: ModelInfo['source']; definition: ModelDef };

// The models of the given providers, sorted by provider, then id.
export function readModels(connection: Connection, providers: ReadonlySet<string>): ModelInfo[] {
  return connection
    .prepare('SELECT provider, id, extension, info, source FROM llm_models')
    .all()
    .filter((row) => providers.has(String(row['provider'])))
    .map((row) => modelInfoSchema.parse({ ...modelDefSchema.parse(JSON.parse(String(row['info']))), id: String(row['id']), extension: String(row['extension']), source: row['source'] }))
    .sort((left, right) => compareByCodePoint(left.provider, right.provider) || compareByCodePoint(left.id, right.id));
}

// A provider's rows replaced whole (ADR 0152), inside the caller's unit.
export function replaceProviderModels(connection: Connection, provider: string, models: readonly StoredModel[], refreshedAt: number): void {
  connection.prepare('DELETE FROM llm_models WHERE provider = ?').run(provider);
  const insert = connection.prepare('INSERT INTO llm_models (provider, id, extension, info, source, refreshed_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const model of models) insert.run(provider, model.id, model.extension, JSON.stringify(model.definition), model.source, refreshedAt);
}
