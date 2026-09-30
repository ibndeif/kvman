import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

// Fixtures are linted inside a small tree of package.json files, so the walls see fake packages and extensions.
const lintRepository = path.join(repositoryRoot, 'test/fixtures/lint-repository');

const eslint = new ESLint({ cwd: lintRepository, overrideConfigFile: path.join(repositoryRoot, 'eslint.config.js') });

// Loading the config and its plugins is a one-time cost that grows with the machine's load; it's paid while this file
// loads, so each test's time is its own lint.
await eslint.calculateConfigForFile(path.join(lintRepository, 'packages/kernel/src/fixture.ts'));

export async function lintFixture(fixture: string, virtualPath: string): Promise<Linter.LintMessage[]> {
  const code = await readFile(path.join(repositoryRoot, 'test/fixtures/lint', fixture), 'utf8');
  const [result] = await eslint.lintText(code, { filePath: path.join(lintRepository, virtualPath) });
  if (result === undefined) throw new Error(`ESLint returned no result for ${fixture}`);
  return result.messages;
}

export function messagesOf(messages: Linter.LintMessage[], ruleId: string): Linter.LintMessage[] {
  return messages.filter((message) => message.ruleId === ruleId);
}

async function wallErrors(fixture: string, virtualPath: string): Promise<string[]> {
  return messagesOf(await lintFixture(fixture, virtualPath), 'kvman/import-walls').map((message) => message.message);
}

export async function expectBlocked(fixture: string, virtualPath: string, reason: RegExp): Promise<void> {
  const errors = await wallErrors(fixture, virtualPath);
  if (errors.length !== 1 || !reason.test(errors[0] ?? '')) {
    throw new Error(`${fixture} at ${virtualPath}: expected one wall error matching ${reason}, got ${JSON.stringify(errors)}`);
  }
}

export async function expectClean(fixture: string, virtualPath: string): Promise<void> {
  const errors = await wallErrors(fixture, virtualPath);
  if (errors.length > 0) throw new Error(`${fixture} at ${virtualPath}: expected no wall error, got ${JSON.stringify(errors)}`);
}
