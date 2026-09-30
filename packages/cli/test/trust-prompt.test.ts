import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { trustDecision } from '../src/trust-prompt.ts';

const versions = [{ name: '@acme/hello', version: '1.0.0', source: 'npm:1.0.0' }];

function terminal(isTerminal: boolean): { input: PassThrough; output: PassThrough; shown(): string; isTerminal: boolean } {
  const input = new PassThrough();
  const output = new PassThrough();
  let shown = '';
  output.setEncoding('utf8').on('data', (text: string) => (shown += text));
  return { input, output, shown: () => shown, isTerminal };
}

describe('the trust prompt (02 §2.9, ADR 0009, 48)', () => {
  it('M1.8-H5 lists each new version and asks; y accepts, --yes accepts without asking, and no terminal refuses', async () => {
    const asked = terminal(true);
    const decision = trustDecision(false, asked)(versions);
    asked.input.write('y\n');
    expect(await decision).toBe(true);
    expect(asked.shown()).toBe("These extension versions haven't been accepted before:\n  @acme/hello@1.0.0 (npm:1.0.0)\nLoad them? [y/N] ");
    const yes = terminal(false);
    expect(await trustDecision(true, yes)(versions)).toBe(true);
    expect(yes.shown()).toBe('');
    expect(await trustDecision(false, terminal(false))(versions)).toBe(false);
  });

  it('M1.8-E17 n, an empty line, and the end of input decline', async () => {
    for (const answer of ['n\n', '\n', null]) {
      const asked = terminal(true);
      const decision = trustDecision(false, asked)(versions);
      if (answer === null) asked.input.end();
      else asked.input.write(answer);
      expect(await decision, JSON.stringify(answer)).toBe(false);
    }
  });
});
