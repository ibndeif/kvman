import { describe, expect, it } from 'vitest';
import type { Preset } from '@kvman/protocol';
import { PresetImportTokens, presetTokenLifetimeMs } from '../../src/index.ts';

const preset: Preset = {
  presetVersion: 1,
  id: 'pdf-app',
  name: 'PDF App',
  revision: 1,
  app: { title: 'PDF App', home: '/help' },
  extensions: {},
};

function changedFirst(body: string): string {
  const first = body[0] === 'A' ? 'B' : 'A';
  return `${first}${body.slice(1)}`;
}

describe('preset import tokens (ADR 0147)', () => {
  it('M2.8-E3 import tokens verify only what this kernel previewed and before expiry', () => {
    let now = 1_000_000;
    const tokens = new PresetImportTokens(() => now);
    const token = tokens.issue(preset);
    expect(tokens.verify(token)).toEqual(preset);

    const [body, signature] = token.split('.');
    if (body === undefined || signature === undefined) throw new Error('a token has two parts');
    expect(tokens.verify(`${changedFirst(body)}.${signature}`)).toBeUndefined();
    expect(tokens.verify(`${body}.${changedFirst(signature)}`)).toBeUndefined();

    const other = new PresetImportTokens(() => now);
    expect(other.verify(token)).toBeUndefined();

    const expiresAt = 1_000_000 + presetTokenLifetimeMs;
    now = expiresAt;
    expect(tokens.verify(token)).toEqual(preset);
    now = expiresAt + 1;
    expect(tokens.verify(token)).toBeUndefined();
  });
});
