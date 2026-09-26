import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProblemError, SecretStore } from '../../src/index.ts';

const correlationId = '01JAZ3K4M5N6P7Q8R9S0T1V2W3';

function home(): string {
  return mkdtempSync(join(tmpdir(), 'kvman-secrets-'));
}

function refusal(load: () => unknown): unknown {
  try {
    load();
  } catch (error) {
    return error instanceof ProblemError ? error.problem : error;
  }
  return undefined;
}

describe('the secrets file (plan 04 §4.7, ADR 0126)', () => {
  it('M2.3-E42 a write replaces the file whole through a temporary file, with mode 0600', () => {
    const folder = home();
    const store = SecretStore.load(folder, correlationId);
    store.apply([{ kind: 'set', extension: '@acme/desk', name: 'apiKey', value: 'one' }]);
    expect(JSON.parse(readFileSync(join(folder, 'secrets.json'), 'utf8'))).toEqual({ '@acme/desk/apiKey': 'one' });
    expect(statSync(join(folder, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(folder, 'secrets.json.tmp'))).toBe(false);
    writeFileSync(join(folder, 'secrets.json.tmp'), 'left behind', { mode: 0o644 });
    store.apply([{ kind: 'set', extension: '@acme/other', name: 'token', value: 'two' }, { kind: 'clear-extension', extension: '@acme/desk' }]);
    expect(JSON.parse(readFileSync(join(folder, 'secrets.json'), 'utf8'))).toEqual({ '@acme/other/token': 'two' });
    expect(statSync(join(folder, 'secrets.json')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(folder, 'secrets.json.tmp'))).toBe(false);
    expect(SecretStore.load(folder, correlationId).get('@acme/other', 'token')).toBe('two');
  });

  it('M2.3-E43 a missing file is empty; one that does not parse, or is not strings, refuses the start and stays as it was', () => {
    expect(SecretStore.load(home(), correlationId).get('@acme/desk', 'apiKey')).toBeUndefined();
    for (const content of ['{"@acme/desk/apiKey": "sk-secret-value', '{"@acme/desk/apiKey": 42}']) {
      const folder = home();
      writeFileSync(join(folder, 'secrets.json'), content);
      const problem = refusal(() => SecretStore.load(folder, correlationId));
      expect(problem).toMatchObject({ code: 'INTERNAL', detail: expect.stringContaining(join(folder, 'secrets.json')) });
      expect(JSON.stringify(problem)).not.toContain('sk-secret-value');
      expect(readFileSync(join(folder, 'secrets.json'), 'utf8')).toBe(content);
    }
  });
});
