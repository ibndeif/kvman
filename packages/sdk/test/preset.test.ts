import { describe, expect, it } from 'vitest';
import { presetSchema } from '../src/index.ts';

const preset = {
  name: 'coder',
  extensions: { '@kvman/kvai': 'bundled', '@acme/x': 'npm:1.2.3', '@me/y': 'path:../y' },
  settings: { 'kvai.defaultModel': 'anthropic/claude-sonnet-5-5', 'kvwebui.home': 'kvcoder.chat' },
};

describe('preset (02 §2.10)', () => {
  it('M1.2-H2 a valid preset parses', () => {
    expect(presetSchema.parse(preset)).toEqual(preset);
  });

  it('M1.2-E7 a source is bundled, npm: with an exact version, or path: with a folder', () => {
    for (const source of ['npm:^1.2.3', 'npm:latest', 'git:foo', 'path:']) {
      const result = presetSchema.safeParse({ ...preset, extensions: { '@acme/x': source } });
      expect(result.error?.issues.map((issue) => issue.path.join('.')), source).toEqual(['extensions.@acme/x']);
    }
  });

  it('M1.2-E8 an unknown key or missing extensions fails', () => {
    expect(presetSchema.safeParse({ ...preset, extension: {} }).success).toBe(false);
    const { extensions: _extensions, ...withoutExtensions } = preset;
    expect(presetSchema.safeParse(withoutExtensions).success).toBe(false);
  });

  it('M1.2-E9 a preset without settings parses', () => {
    const { settings: _settings, ...withoutSettings } = preset;
    expect(presetSchema.safeParse(withoutSettings).success).toBe(true);
  });
});
