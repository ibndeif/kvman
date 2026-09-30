import type { Json } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import { validationFailed } from '../store/json-values.ts';
import type { SettingDefinition } from './settings.ts';

// The preset's settings, checked once every extension has registered its keys (plan 02 §2.8, §2.14 step 7).
export function checkPresetSettings(definitions: ReadonlyMap<string, SettingDefinition>, presetValues: Readonly<Record<string, Json>>): void {
  for (const [key, value] of Object.entries(presetValues)) {
    const definition = definitions.get(key);
    if (definition === undefined) throw kernelProblem('VALIDATION_FAILED', `The preset sets "${key}", which no extension registers.`, { key });
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) throw validationFailed(`The preset's value of "${key}"`, parsed.error);
  }
  for (const definition of definitions.values()) {
    if (definition.defaultValue === undefined && !Object.hasOwn(presetValues, definition.key)) {
      throw kernelProblem('VALIDATION_FAILED', `The setting "${definition.key}" has no default, so the preset must set it.`, { key: definition.key });
    }
  }
}
