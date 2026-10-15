import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandFolder, brandPlan } from './brand-plan.ts';
import { targetOf } from './runtime-plan.ts';
import { systemPathOf, tryRuntime } from './try-runtime.ts';

// `pnpm desktop:brand <brand.json>` (plan 14 §14.9, ADR 0082, 14): the desktop app of one product, for the system it
// runs on. It prepares the runtime as `desktop:build` does, puts the brand and its preset in it, tries the runtime with
// that preset, makes the icons, and builds the installers with the brand's name and identifier.

const root = fileURLToPath(new URL('../..', import.meta.url));
const tauriFolder = path.join(root, 'packages', 'desktop', 'src-tauri');
const given = process.argv[2];
if (given === undefined) throw new Error('Name the brand file: pnpm desktop:brand <brand.json>.');
const brandFile = path.resolve(given);
const beside = (file: string): string => path.resolve(path.dirname(brandFile), file);
const plan = brandPlan(JSON.parse(readFileSync(brandFile, 'utf8')), {
  preset: (file) => JSON.parse(readFileSync(beside(file), 'utf8')),
  icon: (file) => readFileSync(beside(file)),
  iconPath: beside,
});

execFileSync(process.execPath, [fileURLToPath(new URL('prepare-runtime.ts', import.meta.url))], { cwd: root, stdio: 'inherit' });
const brandPath = path.join(tauriFolder, ...brandFolder.split('/'));
mkdirSync(brandPath, { recursive: true });
writeFileSync(path.join(brandPath, 'brand.json'), JSON.stringify(plan.brand));
const presetFile = path.join(brandPath, 'preset.json');
writeFileSync(presetFile, JSON.stringify(plan.preset));
const tried = await tryRuntime({ runtime: path.join(tauriFolder, 'runtime'), target: targetOf(process.platform, process.arch), systemPath: systemPathOf(process.platform, process.env['SystemRoot']), preset: presetFile });
console.log(`The bundle runs ${plan.preset.name}: kvman answered on port ${String(tried.port)}.`);

const tauri = (args: readonly string[]): void => {
  execFileSync('pnpm', ['--filter', '@kvman/desktop', 'exec', 'tauri', ...args], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
};
tauri(['icon', plan.iconFile, '--output', path.join(brandPath, 'icons')]);
const overlay = path.join(mkdtempSync(path.join(tmpdir(), 'kvman-brand-')), 'tauri.brand.json');
writeFileSync(overlay, JSON.stringify(plan.overlay));
tauri(['build', '--config', overlay]);
console.log(`${plan.brand.name} is built: its installers are in packages/desktop/src-tauri/target/release/bundle.`);
