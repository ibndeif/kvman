import { chmodSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { openSecretsFile } from '../../src/secrets/secrets-file.ts';
import { createSettings } from '../../src/settings/settings.ts';
import { createStore } from '../../src/store/store.ts';
import { captureLog } from '../log-capture.ts';
import { useTemporaryHomes } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

const secretValue = 'sk-test-7f3a9c2e-never-stored-elsewhere';

function filesOfHome(home: string): string[] {
  return readdirSync(home, { recursive: true, encoding: 'utf8' }).map((entry) => path.join(home, entry)).filter((file) => statSync(file).isFile());
}

describe('secrets (02 §2.8)', () => {
  it('M1.3-H6 a secret never appears in SQLite or in logs', async () => {
    const test = newHome();
    const log = captureLog();
    const secrets = openSecretsFile(test.home);
    const store = createStore(test.connection, { extension: '@test/ai', workspaceId: 'home' }, test.ids);
    const settings = createSettings({ connection: test.connection, definitions: new Map(), presetValues: {}, logger: log.logger });
    await store.kv.set('provider', 'openai');
    secrets.set('@test/ai', 'apiKey', secretValue);
    await store.collection('calls', z.object({ model: z.string() })).insert({ model: 'gpt' });
    expect(() => settings.resolve('ai.model', 'home')).toThrow();
    log.logger.info('A call ended.', { extension: '@test/ai' });
    expect(secrets.get('@test/ai', 'apiKey')).toBe(secretValue);
    const holding = filesOfHome(test.home).filter((file) => readFileSync(file).includes(secretValue));
    expect(holding).toEqual([path.join(test.home, 'secrets.json')]);
    expect(log.lines.join('\n')).not.toContain(secretValue);
  });

  it('M1.3-E13 each extension sees only its own secrets; a missing one is undefined; delete removes one', () => {
    const secrets = openSecretsFile(newHome().home);
    secrets.set('@test/a', 'token', 'a-token');
    secrets.set('@test/b', 'token', 'b-token');
    expect(secrets.get('@test/a', 'token')).toBe('a-token');
    expect(secrets.get('@test/b', 'token')).toBe('b-token');
    expect(secrets.get('@test/a', 'missing')).toBeUndefined();
    secrets.delete('@test/a', 'token');
    expect(secrets.get('@test/a', 'token')).toBeUndefined();
    expect(secrets.list()).toEqual([{ extension: '@test/b', name: 'token' }]);
  });

  it('M1.3-E14 secrets.json is private on this OS', () => {
    const test = newHome();
    openSecretsFile(test.home).set('@test/a', 'token', 'value');
    const mode = statSync(path.join(test.home, 'secrets.json')).mode & 0o777;
    if (process.platform === 'win32') expect(mode).not.toBe(0);
    else expect(mode).toBe(0o600);
  });

  it('M1.3-E15 a write that cannot complete keeps the old file, and a finished write leaves no temporary file', () => {
    const test = newHome();
    const secrets = openSecretsFile(test.home);
    secrets.set('@test/a', 'token', 'old');
    expect(readdirSync(test.home).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    const file = path.join(test.home, 'secrets.json');
    const before = readFileSync(file, 'utf8');
    // Linux and macOS refuse new files in a read-only folder; Windows refuses a rename over a read-only file.
    const locked = process.platform === 'win32' ? file : test.home;
    chmodSync(locked, process.platform === 'win32' ? 0o444 : 0o500);
    try {
      expect(() => secrets.set('@test/a', 'token', 'new')).toThrow();
    } finally {
      chmodSync(locked, process.platform === 'win32' ? 0o666 : 0o700);
    }
    expect(readdirSync(test.home).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(secrets.get('@test/a', 'token')).toBe('old');
  });
});
