import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

const scenarioId = String.raw`M\d+\.\d+-[HE]\d+`;
const definedScenario = new RegExp(String.raw`^(?:### |\| )(${scenarioId})\b`, 'gm');
const testedScenario = new RegExp(String.raw`\b(?:it|test)\(\s*['"\`](${scenarioId})\b`, 'g');
const testRoots = ['test', 'packages', 'extensions', 'examples'];

function filesUnder(folder: string, accept: (file: string) => boolean): string[] {
  const entries = readdirSync(folder, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && !entry.parentPath.includes('node_modules'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter(accept);
}

function idsIn(files: string[], pattern: RegExp): string[] {
  return files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => match[1] ?? ''));
}

describe('scenario coverage (CLAUDE.md §2)', () => {
  it('M0.2-E41 every scenario has exactly one test and every test has a scenario', () => {
    const scenarioFiles = filesUnder(path.join(repositoryRoot, 'milestones'), (file) => file.endsWith('-TEST-CASES.md'));
    const testFiles = testRoots
      .map((root) => path.join(repositoryRoot, root))
      .filter((root) => existsSync(root))
      .flatMap((root) => filesUnder(root, (file) => file.endsWith('.test.ts')));
    const scenarios = idsIn(scenarioFiles, definedScenario);
    const tests = idsIn(testFiles, testedScenario);
    expect(scenarios.length, 'no scenario ids found').toBeGreaterThan(0);
    expect(new Set(scenarios).size, 'a scenario id is defined twice').toBe(scenarios.length);
    expect(tests.filter((id, index) => tests.indexOf(id) !== index), 'scenario ids tested twice').toEqual([]);
    expect(scenarios.filter((id) => !tests.includes(id)), 'scenarios without a test').toEqual([]);
    expect(tests.filter((id) => !scenarios.includes(id)), 'tests without a scenario').toEqual([]);
  });
});
