import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';

export const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));

export const internalPackageNames = ['cli', 'devtools', 'kernel', 'protocol', 'sdk', 'shell', 'testkit', 'widget-bridge'];

const eslint = new ESLint({ cwd: repositoryRoot });

export async function lintFixture(fixture: string, virtualPath: string): Promise<Linter.LintMessage[]> {
  const code = await readFile(path.join(repositoryRoot, 'test/fixtures/lint', fixture), 'utf8');
  const [result] = await eslint.lintText(code, { filePath: path.join(repositoryRoot, virtualPath) });
  if (result === undefined) throw new Error(`ESLint returned no result for ${fixture}`);
  return result.messages;
}

export function messagesOf(messages: Linter.LintMessage[], ruleId: string): Linter.LintMessage[] {
  return messages.filter((message) => message.ruleId === ruleId);
}
