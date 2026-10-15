import { describe, expect, it } from 'vitest';
import { brandIcons, brandPlan, checkIcon } from '../../release/desktop/brand-plan.ts';

// A PNG's first 24 bytes are enough for the check: its signature and the IHDR chunk's width and height.
function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const preset = { name: 'research-app', extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled', '@ibndeif/research': 'npm:0.2.0' }, settings: { 'kvwebui.home': 'kvcoder.chat' } };
const brand = { name: 'Research Assistant', id: 'research-assistant', preset: 'app.json', icon: 'icon.png' };
const reading = (presetValue: unknown = preset, icon: Uint8Array = png(512, 512)) => ({ preset: () => presetValue, icon: () => icon, iconPath: (file: string) => `/brand/${file}` });

describe('a branded desktop app (14 §14.9, ADR 0082, 14)', () => {
  it('QA52-H16 a brand file makes the overlay, the brand, and the preset the build writes', () => {
    expect(brandPlan(brand, reading())).toEqual({
      brand: { name: 'Research Assistant', id: 'research-assistant' },
      preset,
      iconFile: '/brand/icon.png',
      overlay: { productName: 'Research Assistant', identifier: 'com.ibndeif.kvman.research-assistant', bundle: { active: true, icon: brandIcons, resources: { 'runtime/': 'runtime/' } } },
    });
    expect(brandIcons).toEqual(['runtime/brand/icons/32x32.png', 'runtime/brand/icons/128x128.png', 'runtime/brand/icons/128x128@2x.png', 'runtime/brand/icons/icon.icns', 'runtime/brand/icons/icon.ico']);
  });

  it('QA52-E13 a bad brand file stops the build with a message that names its field', () => {
    expect(() => brandPlan({ ...brand, name: 'x'.repeat(61) }, reading())).toThrow("The brand file's name must be 1 to 60 characters.");
    expect(() => brandPlan({ ...brand, id: 'Research App' }, reading())).toThrow("The brand file's id must be lowercase kebab case, up to 40 characters.");
    expect(() => brandPlan({ ...brand, colour: 'red' }, reading())).toThrow("The brand file has colour, which isn't name, id, preset, or icon.");
    expect(() => brandPlan(brand, reading({ ...preset, extensions: { research: 'path:./research' } }))).toThrow("The brand file's preset runs research from path:./research; a branded app takes only bundled and npm: sources.");
    expect(() => brandPlan(brand, reading({ extensions: {} }))).toThrow("The brand file's preset must be a preset: { name, extensions, settings? }.");
    for (const icon of [png(512, 256), png(256, 256), new Uint8Array([1, 2, 3])]) expect(() => checkIcon(icon)).toThrow("The brand file's icon must be a square PNG of at least 512 px.");
    expect(() => checkIcon(png(1024, 1024))).not.toThrow();
  });
});
