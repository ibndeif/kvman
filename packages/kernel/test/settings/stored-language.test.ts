import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { storedLanguage } from '../../src/settings/stored-language.ts';
import { globalScope } from '../../src/store/store.ts';
import { useTemporaryHomes, type TestHome } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

function withGlobalLanguage(value: Json): TestHome {
  const test = newHome();
  test.connection.prepare('INSERT INTO settings (key, scope, value) VALUES (?, ?, ?)').run('kernel.language', globalScope, JSON.stringify(value));
  return test;
}

describe('the stored language (14 §14.2)', () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it('M3.1-E4 it is the global value, else the preset value, else en', () => {
    expect(storedLanguage(withGlobalLanguage('ar').home, { 'kernel.language': 'fr' })).toBe('ar');
    expect(storedLanguage(newHome().home, { 'kernel.language': 'fr' })).toBe('fr');
    expect(storedLanguage(newHome().home, {})).toBe('en');
  });

  it('M3.1-E5 a stored value that is not text is skipped', () => {
    expect(storedLanguage(withGlobalLanguage(5).home, { 'kernel.language': 'ar' })).toBe('ar');
    expect(storedLanguage(newHome().home, { 'kernel.language': 7 })).toBe('en');
  });

  it('M3.1-E6 a home with no database gets none', () => {
    const home = mkdtempSync(path.join(tmpdir(), 'kvman-home-'));
    folders.push(home);
    expect(storedLanguage(home, { 'kernel.language': 'ar' })).toBe('ar');
    expect(existsSync(path.join(home, 'kvman.db'))).toBe(false);
  });
});
