import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

function compileWithBaseOptions(fixture: string): number[] {
  const configFile = ts.readConfigFile(path.join(repositoryRoot, 'tsconfig.base.json'), (file) => ts.sys.readFile(file));
  const { options } = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repositoryRoot);
  const program = ts.createProgram([path.join(repositoryRoot, 'test/fixtures/compiler', fixture)], { ...options, noEmit: true });
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => diagnostic.code);
}

describe('compiler options of tsconfig.base.json (plan 14 §14.1)', () => {
  it('M0.1-E23 an unchecked indexed read fails (noUncheckedIndexedAccess)', () => {
    expect(compileWithBaseOptions('unchecked-index.ts')).toEqual([2532]);
  });

  it('M0.1-E24 undefined on an optional property fails (exactOptionalPropertyTypes)', () => {
    expect(compileWithBaseOptions('exact-optional.ts')).toEqual([2375]);
  });

  it('M0.1-E25 a type imported without import type fails (verbatimModuleSyntax)', () => {
    expect(compileWithBaseOptions('type-import.ts')).toEqual([1484]);
  });

  it('M0.1-E26 an untyped parameter fails (strict)', () => {
    expect(compileWithBaseOptions('implicit-any.ts')).toEqual([7006]);
  });
});
