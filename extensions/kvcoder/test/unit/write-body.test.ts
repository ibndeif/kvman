import { describe, expect, it } from 'vitest';
import { callInput, parseLine } from '../../src/connector-line.ts';
import { withBody } from '../../src/calls/write-body.ts';

const words = new Set(['fs', 'artifact']);

// The words and stdin of a line as a turn reads them, then as the connector reads them with a body.
function read(line: string) {
  const parsed = parseLine(line, words);
  if (parsed.kind !== 'call') throw new Error('not a connector call');
  return withBody(parsed.words, parsed.stdin);
}

const content = (result: ReturnType<typeof read>): unknown => {
  if ('output' in result) return result.output;
  const call = callInput(result.words, result.stdin, 'fs');
  return 'output' in call ? call.output : call.input;
};

describe('a write whose content is the heredoc body (08 §8.5, ADR 0009, 187)', () => {
  it('QA8-H3 the bash heredoc and the PowerShell here-string both make the body the content, with a final line break', () => {
    const body = 'a "quoted" \\n line\n$HOME and `ticks`';
    expect(content(read(`fs write '{"path":"a.txt"}' <<'EOF'\n${body}\nEOF`))).toEqual({ path: 'a.txt', content: `${body}\n` });
    expect(content(read(`@'\n${body}\n'@ | fs write '{"path":"a.txt"}'`))).toEqual({ path: 'a.txt', content: `${body}\n` });
    expect(content(read(`artifact write '{"id":"x","title":"T","format":"html"}' <<'EOF'\n<p>hi</p>\nEOF`))).toEqual({ id: 'x', title: 'T', format: 'html', content: '<p>hi</p>\n' });
  });

  it('QA8-E1 content in the JSON together with a body fails, and nothing is merged', () => {
    expect(content(read(`fs write '{"path":"a.txt","content":"x"}' <<'EOF'\ny\nEOF`))).toBe('error VALIDATION_FAILED: Give the content once: in the JSON, or as the heredoc body.');
  });

  it('QA8-E2 the JSON argument must be an object', () => {
    expect(content(read(`fs write '[1]' <<'EOF'\ny\nEOF`))).toBe('error VALIDATION_FAILED: The input must be a JSON object.');
    expect(content(read(`fs write 'null' <<'EOF'\ny\nEOF`))).toBe('error VALIDATION_FAILED: The input must be a JSON object.');
    expect(content(read(`fs write '{nope' <<'EOF'\ny\nEOF`))).toMatch(/^error VALIDATION_FAILED: The input isn't JSON: /);
  });

  it('QA8-E3 every other command still takes its JSON once, as an argument or on stdin', () => {
    for (const line of [`fs edit '{"path":"a","edits":[]}' <<'EOF'\n{}\nEOF`, `artifact get '{"id":"x"}' <<'EOF'\n{}\nEOF`]) {
      expect(content(read(line))).toBe('error VALIDATION_FAILED: Give the JSON input once: as an argument or on stdin.');
    }
  });

  it('QA8-E4 an empty body is an empty content, and a write with no body or no argument is left as it was', () => {
    expect(content(read(`fs write '{"path":"a.txt"}' <<'EOF'\n\nEOF`))).toEqual({ path: 'a.txt', content: '' });
    expect(content(read(`fs write '{"path":"a.txt"}' <<'EOF'\nEOF`))).toEqual({ path: 'a.txt', content: '' });
    expect(content(read(`fs write '{"path":"a.txt","content":"x"}'`))).toEqual({ path: 'a.txt', content: 'x' });
    expect(content(read(`fs write <<'EOF'\n{"path":"a.txt","content":"x"}\nEOF`))).toEqual({ path: 'a.txt', content: 'x' });
  });
});
