import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { command, shell } from './support/model-script.ts';

const looked = useLooked();
const nothing = (): void => undefined;

// These lines are bash, the Linux and macOS branch; the Windows branch's program and arguments are covered in
// unit/shell-command.test.ts.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These lines are bash; Windows runs PowerShell.');
}

describe('the shell connector (08 §8.3, ADR 0011, 2)', { timeout: 30_000 }, () => {
  it('QA18-H3 shell exec runs a whole line, with its pipes and separators', async () => {
    posixShell();
    const { results } = await looked(nothing, [shell('printf a; printf b | tr b c')]);
    expect(results).toEqual(['ac\n[exit code 0]']);
  });

  it('QA18-E11 a line past its timeout is killed and reports it', async () => {
    posixShell();
    const { results } = await looked(nothing, [shell('sleep 30', { timeoutMs: 200 })]);
    expect(results).toEqual(['[timed out after 0 s; the process tree was killed]\n[exit code 124]']);
  });

  it('QA18-E12 an unknown key in the payload fails and shows the payload signature, which names line', async () => {
    const { results } = await looked(nothing, [command('shell', 'exec', { command: 'ls', risky: false })]);
    expect(results[0]).toMatch(/^error VALIDATION_FAILED: line: .*payload: Unrecognized key: "command"\. The payload of shell exec is\n\{ line, background\?, timeoutMs\?, risky \}$/s);
  });
});
