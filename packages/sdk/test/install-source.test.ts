import { describe, expect, it } from 'vitest';
import { installSourceSchema, kernelCommandSchemas } from '../src/index.ts';

describe('installSourceSchema (02 §2.12, ADR 0025)', () => {
  it('QA37-H1 accepts bundled:, npm: with a name and an exact version, and path:', () => {
    for (const source of ['bundled:@kvman/kvcoder', 'npm:@acme/notes@1.2.3', 'npm:notes@1.0.0-beta.1', 'path:../notes']) {
      expect(installSourceSchema.parse(source)).toBe(source);
    }
  });

  it('QA37-H1 kernel.extensions.install takes only a source', () => {
    const { input } = kernelCommandSchemas['kernel.extensions.install'];
    expect(input.parse({ source: 'npm:@acme/notes@1.2.3' })).toEqual({ source: 'npm:@acme/notes@1.2.3' });
    expect(input.safeParse({ name: '@acme/notes', source: 'npm:@acme/notes@1.2.3' }).success).toBe(false);
  });

  it('QA37-E2 a source without a name or an exact version, or in another form, fails', () => {
    const bad = ['npm:@acme/notes', 'npm:@acme/notes@^1.2.3', 'npm:not a name!@1.0.0', 'npm:@1.0.0', 'npm:1.2.3', 'bundled', 'bundled:', 'path:', 'git:x', ''];
    for (const source of bad) expect(installSourceSchema.safeParse(source).success, source).toBe(false);
  });
});
