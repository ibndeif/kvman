import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runConnector } from '../src/connector-call.ts';
import { useLooked } from './support/looked.ts';
import { command, fsCall } from './support/model-script.ts';
import { turnState } from './support/turns.ts';

const looked = useLooked();
const nothing = (): void => undefined;

describe("an invalid payload returns its problems and the command's payload (08 §8.3, ADR 0012, 2)", { timeout: 30_000 }, () => {
  it('QA19-H3 an invalid payload returns its problems and the signature', async () => {
    const { results } = await looked(nothing, [command('artifact', 'write', { name: 'plan', content: 'x' })]);
    expect(results[0]).toMatch(/^error VALIDATION_FAILED: /);
    expect(results[0]).toContain('id: ');
    expect(results[0]).toContain('title: ');
    expect(results[0]).toContain('payload: Unrecognized key: "name"');
    expect(results[0]?.endsWith('The payload of artifact write is\n{ id, title, format?: "markdown" | "html" | "url", content }')).toBe(true);
    expect(results[0]).not.toContain('$schema');
    expect(results[0]).not.toContain('"properties"');
  });

  it('QA19-H4 a registered connector\'s invalid payload returns its signature too', async () => {
    const { kernel, results } = await looked(nothing, [command('todo', 'add', {})]);
    expect(results[0]?.endsWith('The payload of todo add is\n{ text }')).toBe(true);
    expect(results[0]).not.toContain('"properties"');
    expect(await runConnector(kernel, { connector: 'todo', command: 'add', payload: {} })).toEqual({ exitCode: 1, output: results[0] });
  });

  it('QA19-E6 a call that asks is checked the same way', async () => {
    const { kernel, sessionId, results } = await looked(nothing, [fsCall('write', { file: 'a.txt', content: 'x' })]);
    expect(results[0]?.endsWith('The payload of fs write is\n{ path, content, risky }')).toBe(true);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    expect(existsSync(path.join(kernel.homeFolder, 'a.txt'))).toBe(false);
  });
});
