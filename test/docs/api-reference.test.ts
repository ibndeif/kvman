import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApiReference, publicPackages } from '../../scripts/api-reference.ts';

const base = fileURLToPath(new URL('../../tsconfig.base.json', import.meta.url));

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// A package entry in a temporary folder, with its own tsconfig.
function entry(source: string): { entryPoints: string[]; tsconfig: string; out: string } {
  const folder = mkdtempSync(join(tmpdir(), 'kvman-api-'));
  folders.push(folder);
  writeFileSync(join(folder, 'index.ts'), source);
  writeFileSync(join(folder, 'tsconfig.json'), JSON.stringify({ extends: base, compilerOptions: { noEmit: true }, include: ['index.ts'] }));
  return { entryPoints: [join(folder, 'index.ts')], tsconfig: join(folder, 'tsconfig.json'), out: join(folder, 'api') };
}

describe('the API reference of the public packages (14 §14.5, ADR 0168)', { timeout: 120_000 }, () => {
  it('M2.13-H5 an undocumented export or member fails, and the SDK and widget bridge pass', async () => {
    const bareFunction = await buildApiReference(entry('/** Documented. */\nexport function documented(): void {}\nexport function undocumented(): void {}\n'));
    expect(bareFunction.ok).toBe(false);
    expect(bareFunction.problems.join('\n')).toContain('undocumented');

    const bareMember = await buildApiReference(entry('/** A shape. */\nexport interface Shape {\n  /** Its size. */\n  size: number;\n  draw(): void;\n}\n'));
    expect(bareMember.ok).toBe(false);
    expect(bareMember.problems.join('\n')).toContain('Shape.draw');

    const out = mkdtempSync(join(tmpdir(), 'kvman-api-public-'));
    folders.push(out);
    expect(await buildApiReference({ ...publicPackages, out })).toEqual({ ok: true, problems: [] });
    expect(existsSync(join(out, 'index.html'))).toBe(true);
  });
});
