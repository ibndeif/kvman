import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { scaffoldVersions } from '../../src/ext/scaffold-versions.ts';

const manifestSchema = z.object({ version: z.string(), dependencies: z.record(z.string(), z.string()).optional(), devDependencies: z.record(z.string(), z.string()).optional() });
const read = (file: string) => manifestSchema.parse(JSON.parse(readFileSync(new URL(`../../../../${file}`, import.meta.url), 'utf8')));

describe('the scaffold pins (09 §9.2, ADR 0009, 126–127)', () => {
  it("M2.5-E13 the pins equal the monorepo's versions", () => {
    const root = read('package.json');
    const kvwebui = read('extensions/kvwebui/package.json');
    expect(scaffoldVersions).toEqual({
      sdk: read('packages/sdk/package.json').version,
      testkit: read('packages/testkit/package.json').version,
      typescript: root.devDependencies?.['typescript'],
      typesNode: root.devDependencies?.['@types/node'],
      vite: kvwebui.devDependencies?.['vite'],
      pluginVue: kvwebui.devDependencies?.['@vitejs/plugin-vue'],
      vue: kvwebui.dependencies?.['vue'],
    });
  });
});
