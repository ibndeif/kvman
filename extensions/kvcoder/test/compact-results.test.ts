import { describe, expect, it } from 'vitest';
import { useLooked } from './support/looked.ts';
import { fsCall, shell } from './support/model-script.ts';

const looked = useLooked();

const prepare = (folder: string): void => {
  looked.write(folder, 'a.txt', 'find me\nnot this\nfind me too\n');
  looked.write(folder, 'b.txt', 'find me\n');
};

describe('what a command returns, and what is stored of it (08 §8.3 and §8.5, ADR 0034, 4, 5, and 7)', { timeout: 30_000 }, () => {
  it('QA46-H4 a command returns JSON on one line', async () => {
    const { results } = await looked(prepare, [fsCall('list', { path: '.' })]);
    expect(results[0]).not.toContain('\n');
    expect(JSON.parse(String(results[0]))).toMatchObject({ path: '.', truncated: false });
    expect(results[0]).toContain('{"name":"a.txt","kind":"file","bytes":29}');
  });

  it('QA46-H5 a search groups its matches by file, in path order', async () => {
    const { results } = await looked(prepare, [fsCall('search', { pattern: 'find' })]);
    expect(JSON.parse(String(results[0]))).toEqual({
      files: [
        { path: 'a.txt', matches: [{ line: 1, text: 'find me' }, { line: 3, text: 'find me too' }] },
        { path: 'b.txt', matches: [{ line: 1, text: 'find me' }] },
      ],
      truncated: false,
    });
  });

  it('QA46-H6 a tool result keeps its output once, and a shell line keeps its own', async () => {
    const { kernel, sessionId, results } = await looked(prepare, [fsCall('read', { path: 'b.txt' }), shell('echo hi')]);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const [read, line] = messages.filter((message) => message.kind === 'toolResult').map((message) => message.content['details']);
    expect(read).toMatchObject({ connector: 'fs', command: 'read' });
    expect(read).not.toHaveProperty('output');
    expect(results[0]).toBe('{"path":"b.txt","fromLine":1,"totalLines":1,"content":"find me\\n"}');
    expect(line).toMatchObject({ connector: 'shell', command: 'exec', output: 'hi\n', exitCode: 0 });
    expect(results[1]).toBe('hi\n[exit code 0]');
  });
});
