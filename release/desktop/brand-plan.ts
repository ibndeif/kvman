// A branded desktop app's plan (plan 14 §14.9, ADR 0082, 14): the brand file `{ name, id, preset, icon }` checked, and
// what the build writes from it. The preset's own schema is the kernel's, checked when the build tries the runtime with
// it; here only its shape and its sources are, since a branded app installs what it runs and has no folder of yours.

export type Brand = { name: string; id: string };

export type BrandPreset = { name: string; extensions: Record<string, string>; settings?: Record<string, unknown> };

/** The configuration a branded `tauri build` merges over `tauri.conf.json`. */
export type TauriOverlay = {
  productName: string;
  identifier: string;
  bundle: { active: true; icon: string[]; resources: Record<string, string> };
};

export type BrandPlan = { brand: Brand; preset: BrandPreset; iconFile: string; overlay: TauriOverlay };

/** Where the build puts the brand inside the runtime, relative to `src-tauri`. */
export const brandFolder = 'runtime/brand';

/** The icons `tauri icon` makes, relative to `src-tauri`. */
export const brandIcons = ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico'].map((file) => `${brandFolder}/icons/${file}`);

const idPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function text(file: Record<string, unknown>, field: string, check: (value: string) => boolean, rule: string): string {
  const value = file[field];
  if (typeof value !== 'string' || !check(value)) throw new Error(`The brand file's ${field} must be ${rule}.`);
  return value;
}

function presetOf(value: unknown): BrandPreset {
  if (!isRecord(value) || typeof value['name'] !== 'string' || value['name'] === '' || !isRecord(value['extensions'])) throw new Error('The brand file\'s preset must be a preset: { name, extensions, settings? }.');
  const extensions: Record<string, string> = {};
  for (const [name, source] of Object.entries(value['extensions'])) {
    if (typeof source !== 'string' || !(source === 'bundled' || source.startsWith('npm:'))) {
      throw new Error(`The brand file's preset runs ${name} from ${String(source)}; a branded app takes only bundled and npm: sources.`);
    }
    extensions[name] = source;
  }
  const settings = value['settings'];
  if (settings !== undefined && !isRecord(settings)) throw new Error("The brand file's preset settings must be an object.");
  return { name: value['name'], extensions, ...(settings === undefined ? {} : { settings }) };
}

/** Throws unless `png` is a square PNG of at least 512 px. */
export function checkIcon(png: Uint8Array): void {
  const signed = pngSignature.every((byte, index) => png[index] === byte);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const sized = png.byteLength >= 24 && String.fromCharCode(...png.slice(12, 16)) === 'IHDR';
  const width = sized ? view.getUint32(16) : 0;
  const height = sized ? view.getUint32(20) : 0;
  if (!signed || !sized || width !== height || width < 512) throw new Error("The brand file's icon must be a square PNG of at least 512 px.");
}

/** The plan for `brand`, the parsed brand file, with its preset and icon read by `read` (relative to the brand file). */
export function brandPlan(brand: unknown, read: { preset(file: string): unknown; icon(file: string): Uint8Array; iconPath(file: string): string }): BrandPlan {
  if (!isRecord(brand)) throw new Error('The brand file must be { name, id, preset, icon }.');
  const unknown = Object.keys(brand).find((key) => !['name', 'id', 'preset', 'icon'].includes(key));
  if (unknown !== undefined) throw new Error(`The brand file has ${unknown}, which isn't name, id, preset, or icon.`);
  const name = text(brand, 'name', (value) => value.trim() !== '' && value.length <= 60, '1 to 60 characters');
  const id = text(brand, 'id', (value) => value.length <= 40 && idPattern.test(value), 'lowercase kebab case, up to 40 characters');
  const presetFile = text(brand, 'preset', (value) => value !== '', 'a preset file');
  const iconFile = text(brand, 'icon', (value) => value !== '', 'a PNG file');
  const preset = presetOf(read.preset(presetFile));
  checkIcon(read.icon(iconFile));
  return {
    brand: { name, id },
    preset,
    iconFile: read.iconPath(iconFile),
    overlay: { productName: name, identifier: `com.ibndeif.kvman.${id}`, bundle: { active: true, icon: brandIcons, resources: { 'runtime/': 'runtime/' } } },
  };
}
