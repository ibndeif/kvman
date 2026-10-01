import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { presetSchema, z } from '@kvman/sdk';
import { bundledExtensions, bundledPresetsFolder } from '../src/bundled.ts';
import { defaultPreset, findPreset } from '../src/preset-lookup.ts';

// The bundled presets (plan 11): both name bundled extensions only, and their titles are translation keys with `en` and
// `ar` entries in the catalog of the extension that owns the key.

const catalogSchema = z.record(z.string(), z.string());
const extensions = bundledExtensions();

function catalogText(key: string, language: string): string | undefined {
  const namespace = key.split('.')[0] ?? '';
  const folder = [...extensions.values()].find((candidate) => path.basename(candidate) === namespace) ?? '';
  return catalogSchema.parse(JSON.parse(readFileSync(path.join(folder, 'locales', `${language}.json`), 'utf8')))[key];
}

describe('the bundled presets (11)', () => {
  it.each(['coder', 'dev'])('M2.5-E40 %s is a valid preset of bundled extensions only, with a translated title', (name) => {
    const { preset } = findPreset(name, { bundled: bundledPresetsFolder, home: path.join(bundledPresetsFolder, 'no-home'), start: bundledPresetsFolder });
    expect(presetSchema.parse(preset).name).toBe(name);
    for (const [extension, source] of Object.entries(preset.extensions)) {
      expect(source).toBe('bundled');
      expect(extensions.has(extension)).toBe(true);
    }
    const title = z.string().parse(preset.settings?.['kvwebui.title']);
    expect(catalogText(title, 'en')).toEqual(expect.any(String));
    expect(catalogText(title, 'ar')).toEqual(expect.any(String));
  });

  it('M2.5-E40 the default preset is coder', () => {
    expect(defaultPreset).toBe('coder');
  });
});
