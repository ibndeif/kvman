import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { repositoryRoot } from './repository.ts';

const sourceFolder = path.join(repositoryRoot, 'packages/sdk/src');

function isExported(statement: ts.Statement): boolean {
  if (ts.isExportDeclaration(statement)) return statement.moduleSpecifier !== undefined && !statement.moduleSpecifier.getText().startsWith("'.");
  return ts.canHaveModifiers(statement) && (ts.getModifiers(statement) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

// The TSDoc comment right above a statement: `/** … */` whose first line of text is the summary.
function summaryOf(source: ts.SourceFile, statement: ts.Statement): string | undefined {
  const ranges = ts.getLeadingCommentRanges(source.text, statement.pos) ?? [];
  const last = ranges.at(-1);
  if (last === undefined) return undefined;
  const comment = source.text.slice(last.pos, last.end);
  if (!comment.startsWith('/**')) return undefined;
  return comment.replace(/^\/\*\*\s*/, '').replace(/\s*\*\/$/, '').split('\n')[0]?.trim();
}

function undocumentedExports(): string[] {
  return readdirSync(sourceFolder).flatMap((file) => {
    const source = ts.createSourceFile(file, readFileSync(path.join(sourceFolder, file), 'utf8'), ts.ScriptTarget.Latest, true);
    return source.statements
      .filter((statement) => isExported(statement) && !summaryOf(source, statement))
      .map((statement) => `${file}: ${statement.getText().split('\n')[0]}`);
  });
}

describe('sdk documentation (CLAUDE.md §5)', () => {
  it('M1.2-E18 every export of @kvman/sdk has a one-line TSDoc comment', () => {
    expect(undocumentedExports()).toEqual([]);
  });
});
