import type { Issue, JsonObject } from '@kvman/protocol';
import { jsonObjectSchema } from '@kvman/protocol';
import { PayloadValidators } from '../router/payload-validators.ts';
import type { Connection } from '../storage/driver.ts';
import { ConfigChecker, mergedConfig, secretIssues } from './config-values.ts';

const checker = new ConfigChecker(new PayloadValidators());

function storedValue(text: unknown): JsonObject {
  return jsonObjectSchema.parse(JSON.parse(String(text)));
}

function prefixed(issues: readonly Issue[], prefix: string): Issue[] {
  return issues.map((issue) => ({ ...issue, path: issue.path === '' ? prefix : `${prefix}.${issue.path}` }));
}

// 04 §4.8, ADR 0143: every stored config value of an extension (its global row, and each workspace row merged over
// it) against a version's config schema; issue paths start with `global` or `workspaces.<id>`.
export function storedConfigIssues(connection: Connection, extension: string, schema: JsonObject | undefined): Issue[] {
  if (schema === undefined) return [];
  const globalRow = connection.prepare('SELECT value FROM global_config WHERE extension = ?').get(extension);
  const global = globalRow === undefined ? {} : storedValue(globalRow['value']);
  const issues = globalRow === undefined ? [] : prefixed([...secretIssues(schema, global), ...checker.issues(schema, mergedConfig(schema, global, undefined))], 'global');
  const rows = connection.prepare('SELECT workspace_id, value FROM workspace_config WHERE extension = ? ORDER BY workspace_id').all(extension);
  for (const row of rows) {
    const value = storedValue(row['value']);
    const found = [...secretIssues(schema, value), ...checker.issues(schema, mergedConfig(schema, global, value))];
    issues.push(...prefixed(found, `workspaces.${String(row['workspace_id'])}`));
  }
  return issues;
}
