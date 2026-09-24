import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

const adrFolder = path.join(repositoryRoot, 'plan/adr');

function spikeAdr(number: string): string {
  const file = readdirSync(adrFolder).find((name) => name.startsWith(`${number}-`));
  if (file === undefined) throw new Error(`ADR ${number} is missing`);
  return readFileSync(path.join(adrFolder, file), 'utf8');
}

function measurements(adr: string): string {
  const start = adr.indexOf('## Measurements');
  expect(start, 'a Measurements section').toBeGreaterThan(-1);
  return adr.slice(start);
}

describe('spike ADRs (plan 15 M0.5)', () => {
  it('M0.5-H1 the four ADRs exist with measured results', () => {
    const expected: Record<string, RegExp[]> = {
      '0001': [/units\/s/, /p99 \d/],
      '0002': [/ERR_ACCESS_DENIED/, /ERR_DLOPEN_DISABLED/, /node:sqlite/],
      '0003': [/@earendil-works\/pi-ai/, /0\.87\.1/],
      '0004': [/\d+ ms/, /--test-isolation=none/],
    };
    for (const [number, patterns] of Object.entries(expected)) {
      const adr = spikeAdr(number);
      expect(adr, number).toMatch(/- \*\*Status\*\*: accepted/);
      for (const pattern of patterns) expect(measurements(adr), `${number} ${pattern}`).toMatch(pattern);
    }
  });
});
