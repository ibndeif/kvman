import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { candidateGateOrder } from '../../release/candidate/candidate-plan.ts';
import {
  checkEmissions,
  describeScriptFailure,
  runCandidate,
  type EmissionReader,
  type ScriptResult,
} from '../../release/candidate/run-candidate.ts';

// Focused runner coverage (KVC34, ADR 0047): structural, negative, and isolated native
// subprocess checks. No repository-wide gate runs here; subprocesses are trivial
// `node --eval` programs and inherit the process environment, preserving index guards.

const passed: ScriptResult = { status: 0, signal: null, output: '' };

function readerWith(overrides: Partial<EmissionReader>): EmissionReader {
  return {
    readPackageJson: () => '{"name": "@kvman/sdk"}',
    emissionExists: () => true,
    ...overrides,
  };
}

describe('local candidate runner (KVC34, ADR 0047)', () => {
  it('runs test and bench once each in the documented order', () => {
    expect(candidateGateOrder.filter((gate) => gate === 'test')).toHaveLength(1);
    expect(candidateGateOrder.filter((gate) => gate === 'bench:check')).toHaveLength(1);
    expect(candidateGateOrder.indexOf('test')).toBeLessThan(candidateGateOrder.indexOf('emissions'));
    expect(candidateGateOrder.indexOf('emissions')).toBeLessThan(candidateGateOrder.indexOf('bench:check'));
  });

  it('treats nonzero exit, signal, and spawn error as failures', () => {
    expect(describeScriptFailure('lint', passed)).toBeUndefined();
    expect(describeScriptFailure('lint', { status: 1, signal: null, output: 'no' })).toContain('exited 1');
    expect(describeScriptFailure('lint', { status: null, signal: 'SIGTERM', output: '' })).toContain('SIGTERM');
    expect(describeScriptFailure('lint', { status: null, signal: null, output: '', error: new Error('boom') })).toContain('did not start');
  });

  it('stops at the first failing script without running later gates', () => {
    const attempted: string[] = [];
    const report = runCandidate({
      host: 'linux x64',
      runScript: (script) => {
        attempted.push(script);
        return script === 'lint' ? { status: 2, signal: null, output: 'lint output' } : passed;
      },
      reader: readerWith({
        readPackageJson: () => '{"name": "x"}',
        emissionExists: () => true,
      }),
    });
    expect(report.ok).toBe(false);
    expect(attempted).toEqual(['typecheck', 'lint']);
    expect(report.gates.map((gate) => gate.gate)).toEqual(['typecheck', 'lint']);
  });

  it('stops at emission failures before bench:check', () => {
    const attempted: string[] = [];
    const report = runCandidate({
      host: 'linux x64',
      runScript: (script) => {
        attempted.push(script);
        return passed;
      },
      reader: readerWith({ emissionExists: () => false }),
    });
    expect(report.ok).toBe(false);
    expect(attempted).toEqual(['typecheck', 'lint', 'test', 'build']);
    expect(report.gates.at(-1)?.gate).toBe('emissions');
  });

  it('reports name mismatch and missing package or emission files', () => {
    const missing: EmissionReader = {
      readPackageJson: () => '{"name": "@kvman/other"}',
      emissionExists: (folder, _entry, kind) => !(folder === 'sdk' && kind === 'js'),
    };
    const failures = checkEmissions(missing, [
      { folder: 'sdk', name: '@kvman/sdk', entry: 'index' },
      { folder: 'gone', name: '@kvman/kernel', entry: 'index' },
    ]);
    expect(checkEmissions(readerWith({}), [{ folder: 'sdk', name: '@kvman/sdk', entry: 'index' }])).toEqual([]);
    expect(failures.join('\n')).toContain('wrong name');
    expect(failures.join('\n')).toContain('dist/index.js is missing');
    const thrown: EmissionReader = {
      readPackageJson: () => {
        throw new Error('absent');
      },
      emissionExists: () => true,
    };
    expect(checkEmissions(thrown, [{ folder: 'sdk', name: '@kvman/sdk', entry: 'index' }]).join('\n')).toContain('is missing');
  });

  it('handles isolated native subprocess outcomes without repository gates', () => {
    const ok = spawnSync(process.execPath, ['--eval', 'process.exit(0)'], { encoding: 'utf8' });
    expect(describeScriptFailure('test', { status: ok.status, signal: ok.signal, output: '' })).toBeUndefined();
    const bad = spawnSync(process.execPath, ['--eval', 'process.exit(3)'], { encoding: 'utf8' });
    expect(describeScriptFailure('test', { status: bad.status, signal: bad.signal, output: '' })).toContain('exited 3');
    const missingCommand = spawnSync('kvman-missing-command-34', { encoding: 'utf8' });
    if (missingCommand.error === undefined) throw new Error('The missing-command fixture unexpectedly started.');
    expect(describeScriptFailure('test', { status: missingCommand.status, signal: missingCommand.signal, output: '', error: missingCommand.error })).toContain(
      'did not start',
    );
    const signaled = spawnSync(process.execPath, ['--eval', "process.kill(process.pid, 'SIGTERM')"], { encoding: 'utf8' });
    expect(describeScriptFailure('test', { status: signaled.status, signal: signaled.signal, output: '' })).toContain('SIGTERM');
  });
});
