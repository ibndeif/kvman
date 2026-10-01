import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';
import type { Section } from '../../src/registry/register-sections.ts';

const section = (id: string, order: number, size: number): Section => ({ id, title: id, order, owner: '@test/todo', global: false, sessionId: null, content: 'x'.repeat(size), size });

describe('the prompt builder (08 §8.2)', () => {
  it("M2.4-E53 the base prompt names each OS and its shell, sections follow, the index ends it, and sections past 64 KB are left out", () => {
    const base = { workspacePath: '/w', language: 'en', sections: [], connectors: [{ name: 'todo', description: 'Keep a todo list.' }] };
    expect(buildPrompt({ ...base, platform: 'darwin', toolName: 'bash' }).prompt).toContain('in the folder /w on macOS.\nReply in English (en)');
    const windows = buildPrompt({ ...base, platform: 'win32', toolName: 'powershell' }).prompt;
    expect(windows).toContain('on Windows');
    expect(windows).toContain('Your one tool is powershell: it runs a PowerShell command.');
    expect(windows.endsWith('## Connectors\n- todo: Keep a todo list.')).toBe(true);
    const big = [section('a', 1, 30_000), section('b', 2, 30_000), section('c', 3, 10_000), section('d', 4, 4_000)];
    const built = buildPrompt({ ...base, platform: 'linux', toolName: 'bash', sections: big });
    expect(built.left.map((left) => left.id)).toEqual(['c']);
    expect([...built.included].map((kept) => kept.id)).toEqual(['a', 'b', 'd']);
  });
});
