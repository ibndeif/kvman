import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { packageRoot, repositoryRoot } from './support.ts';

const read = (file: string): string => readFileSync(file, 'utf8');

// The `--<prefix>-<name>: #rrggbb` values of the first block whose selector line is `selector {`.
function colours(css: string, selector: string, prefix: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`The stylesheet has no "${selector}" block.`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(new RegExp(`--${prefix}-([a-z-]+): (#[0-9a-f]{6});`, 'g'))].map((match) => [match[1] ?? '', match[2] ?? '']));
}

type Configuration = { productName: string; identifier: string; app: { security: { csp: string; capabilities: string[] } } };

function configuration(): Configuration {
  return JSON.parse(read(`${packageRoot}src-tauri/tauri.conf.json`)) as Configuration;
}

// kvwebui's `--kv-color-*` name for each of its own colours (plan 06 §6.4).
const kvwebuiName: Record<string, string> = { background: 'ground', surface: 'surface', text: 'ink', muted: 'muted', border: 'line', primary: 'primary', 'on-primary': 'on-primary', danger: 'danger' };

describe("the page's rules (14 §14.5, §14.9)", () => {
  it('M3.2-H16 the page makes no call of its own', () => {
    const sources = readdirSync(`${packageRoot}src`).map((name) => read(`${packageRoot}src/${name}`));
    expect(sources.length).toBeGreaterThan(2);
    for (const source of sources) expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(read(`${packageRoot}page/index.html`)).not.toMatch(/https?:\/\//);
    const policy = configuration().app.security.csp;
    expect(policy.split('; ')).toContain('connect-src ipc: http://ipc.localhost');
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toMatch(/127\.0\.0\.1|https:|\*|unsafe/);
  });

  it('M3.2-E26 the shell\'s functions are granted to the app\'s own page only, and they are the home screen\'s four', () => {
    const granted = ['allow-home-load', 'allow-home-continue', 'allow-home-remove', 'allow-home-open-folder'];
    const capability: unknown = JSON.parse(read(`${packageRoot}src-tauri/capabilities/home.json`));
    expect(capability).toEqual({ identifier: 'home', description: expect.any(String), windows: ['main'], permissions: granted });
    expect(configuration().app.security.capabilities).toEqual(['home']);
    const build = read(`${packageRoot}src-tauri/build.rs`);
    const invoked = read(`${packageRoot}src/main.ts`);
    for (const permission of granted) {
      const command = permission.replace('allow-', '').replaceAll('-', '_');
      expect(build, command).toContain(`"${command}"`);
      expect(invoked, command).toContain(`'${command}'`);
    }
    expect([...invoked.matchAll(/invoke\('([a-z_]+)'/g)]).toHaveLength(granted.length);
  });

  it('M3.2-E28 the app is kvman at the root version, with its identifier', () => {
    const manifest = (file: string): { version?: string } => JSON.parse(read(file)) as { version?: string };
    const rootVersion = manifest(`${repositoryRoot}package.json`).version;
    expect(manifest(`${packageRoot}package.json`).version).toBe(rootVersion);
    expect(read(`${packageRoot}src-tauri/Cargo.toml`)).toContain(`\nversion = "${String(rootVersion)}"\n`);
    expect(configuration()).toMatchObject({ productName: 'kvman', identifier: 'com.ibndeif.kvman' });
  });

  it("M3.2-E24 the colours are kvwebui's, for light and for dark, and the styles are logical", () => {
    const page = read(`${packageRoot}page/styles.css`);
    const kvwebui = read(`${repositoryRoot}extensions/kvwebui/web/src/styles/main.css`);
    const expected = (theme: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(kvwebuiName).map(([name, own]) => [name, theme[own] ?? '']));
    const light = expected(colours(kvwebui, ':root', 'kvwebui'));
    const dark = expected(colours(kvwebui, '.dark', 'kvwebui'));
    expect(Object.values(light).concat(Object.values(dark)).filter((value) => value === '')).toEqual([]);
    expect(colours(page, ':root', 'kv-color')).toEqual(light);
    expect(colours(page, ":root[data-theme='dark']", 'kv-color')).toEqual(dark);
    expect(colours(page, ':root:not([data-theme])', 'kv-color')).toEqual(dark);
    expect(page).toContain('@media (prefers-color-scheme: dark)');
    expect(page.match(/#[0-9a-f]{3,8}\b/g)?.length).toBe(Object.keys(kvwebuiName).length * 3);
    expect(page).not.toMatch(/(margin|padding|border|inset)-(left|right|top|bottom)\b|^\s*(left|right|top|bottom|width|height)\s*:|text-align:\s*(left|right)|float\s*:/m);
  });
});
