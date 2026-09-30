import type { Json, SettingScope, z } from '@kvman/sdk';
import type { KernelLogger } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import { globalScope } from '../store/store.ts';
import { validationFailed } from '../store/json-values.ts';

// Settings (plan 02 §2.8): a value comes from the workspace, else global, else the preset, else the default. A stored
// value that no longer fits its key's schema is skipped with a warning, and the next source is used.

export type SettingDefinition = {
  key: string;
  extension: string;
  description: string;
  schema: z.ZodType;
  defaultValue: { value: unknown } | undefined;
  scopes: readonly SettingScope[];
};

export type SettingSource = 'workspace' | 'global' | 'preset' | 'default';

export type ResolvedSetting = { value: unknown; source: SettingSource };

export type Settings = {
  resolve(key: string, workspaceId: string): ResolvedSetting;
  set(key: string, value: Json, scope: SettingScope, workspaceId: string): void;
  reset(key: string, scope: SettingScope, workspaceId: string): void;
};

export type SettingsOptions = {
  connection: Connection;
  definitions: ReadonlyMap<string, SettingDefinition>;
  presetValues: Readonly<Record<string, Json>>;
  logger: KernelLogger;
};

function storedScope(scope: SettingScope, workspaceId: string): string {
  return scope === 'global' ? globalScope : workspaceId;
}

export function createSettings({ connection, definitions, presetValues, logger }: SettingsOptions): Settings {
  const definition = (key: string): SettingDefinition => {
    const found = definitions.get(key);
    if (found === undefined) throw kernelProblem('NOT_FOUND', `There is no setting "${key}".`, { key });
    return found;
  };
  const allowed = (setting: SettingDefinition, scope: SettingScope): void => {
    if (!setting.scopes.includes(scope)) {
      throw kernelProblem('VALIDATION_FAILED', `The setting "${setting.key}" can't be set in the ${scope} scope.`, { key: setting.key, scope });
    }
  };
  const stored = (setting: SettingDefinition, scope: SettingScope, workspaceId: string): { value: unknown } | undefined => {
    if (!setting.scopes.includes(scope)) return undefined;
    const row = connection
      .prepare<[string, string], { value: string }>('SELECT value FROM settings WHERE key = ? AND scope = ?')
      .get(setting.key, storedScope(scope, workspaceId));
    if (row === undefined) return undefined;
    const parsed = setting.schema.safeParse(JSON.parse(row.value));
    if (parsed.success) return { value: parsed.data };
    logger.warn('A stored setting no longer fits its schema, so it is skipped.', { key: setting.key, scope });
    return undefined;
  };

  return {
    resolve(key, workspaceId) {
      const setting = definition(key);
      const workspace = stored(setting, 'workspace', workspaceId);
      if (workspace !== undefined) return { value: workspace.value, source: 'workspace' };
      const global = stored(setting, 'global', workspaceId);
      if (global !== undefined) return { value: global.value, source: 'global' };
      if (Object.hasOwn(presetValues, key)) {
        const parsed = setting.schema.safeParse(presetValues[key]);
        if (!parsed.success) throw validationFailed(`The preset's value of "${key}"`, parsed.error);
        return { value: parsed.data, source: 'preset' };
      }
      if (setting.defaultValue !== undefined) return { value: setting.defaultValue.value, source: 'default' };
      throw kernelProblem('VALIDATION_FAILED', `The setting "${key}" has no value; the preset must set it.`, { key });
    },
    set(key, value, scope, workspaceId) {
      const setting = definition(key);
      allowed(setting, scope);
      const parsed = setting.schema.safeParse(value);
      if (!parsed.success) throw validationFailed(`The value of "${key}"`, parsed.error);
      connection
        .prepare('INSERT INTO settings (key, scope, value) VALUES (?, ?, ?) ON CONFLICT DO UPDATE SET value = excluded.value')
        .run(key, storedScope(scope, workspaceId), JSON.stringify(value));
    },
    reset(key, scope, workspaceId) {
      allowed(definition(key), scope);
      connection.prepare('DELETE FROM settings WHERE key = ? AND scope = ?').run(key, storedScope(scope, workspaceId));
    },
  };
}
