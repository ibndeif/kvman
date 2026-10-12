import { describe, expect, it } from 'vitest';
import { checkEmissions, runCandidate, type EmissionReader } from '../../release/candidate/run-candidate.ts';
import { packageEmissions } from '../../release/candidate/candidate-plan.ts';

const sdk = [{ folder: 'sdk', name: '@kvman/sdk', entry: 'index' }];
const reader = (manifest: string): EmissionReader => ({ readPackageJson: () => manifest, emissionExists: () => true });

describe('candidate emission validation', () => {
  it('checks parsed manifest names regardless of JSON whitespace', () => {
    expect(checkEmissions(reader('{"name":"@kvman/sdk"}'), sdk)).toEqual([]);
  });

  it('does not accept a matching nested name in a differently named package', () => {
    expect(checkEmissions(reader('{"name": "wrong", "nested": {"name": "@kvman/sdk"}}'), sdk).join('\n')).toContain('wrong name');
  });

  it('reports invalid manifest JSON rather than treating a name fragment as a package', () => {
    expect(checkEmissions(reader('"name": "@kvman/sdk"'), sdk).join('\n')).toContain('invalid');
  });

  it('reports filesystem inspection errors at the emission gate without attempting benchmarks', () => {
    const attempted: string[] = [];
    const report = runCandidate({
      host: 'linux x64',
      runScript: (script) => { attempted.push(script); return { status: 0, signal: null, output: '' }; },
      reader: {
        readPackageJson: (folder) => JSON.stringify({ name: packageEmissions.find((pkg) => pkg.folder === folder)?.name }),
        emissionExists: () => { throw new Error('Filesystem unavailable'); },
      },
    });
    expect(report.ok).toBe(false);
    expect(report.gates.at(-1)?.gate).toBe('emissions');
    expect(report.gates.at(-1)?.detail).toContain('Filesystem unavailable');
    expect(attempted).toEqual(['typecheck', 'lint', 'test', 'build']);
  });
});
