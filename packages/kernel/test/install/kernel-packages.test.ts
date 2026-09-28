import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kernelReadRoots } from '../../src/install/kernel-packages.ts';

describe('sandbox read roots', () => {
  it('M2.11-E47 includes only the eight required packages with both ICU import and real paths', () => {
    const roots = kernelReadRoots();
    const names = roots.map((root) => {
      expect(existsSync(root)).toBe(true);
      const file = join(root, 'package.json');
      expect(existsSync(file)).toBe(true);
      const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null || !('name' in parsed)) throw new Error(`missing package name: ${file}`);
      return parsed.name;
    });
    expect(names.slice(0, 4)).toEqual(['@kvman/kernel', '@kvman/protocol', '@kvman/sdk', 'zod']);
    const icu = ['intl-messageformat', '@formatjs/fast-memoize', '@formatjs/icu-messageformat-parser', '@formatjs/icu-skeleton-parser'];
    expect(new Set(names)).toEqual(new Set([...names.slice(0, 4), ...icu]));
    for (const name of icu) {
      const matching = roots.filter((_, index) => names[index] === name);
      expect(matching).toHaveLength(2);
      expect(matching.some((root) => root === realpathSync(root))).toBe(true);
      expect(matching.some((root) => root !== realpathSync(root))).toBe(true);
    }
  });
});
