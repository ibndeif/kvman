import { describe, expect, it } from 'vitest';
import { shellTool } from '../../src/calls/shell-tool.ts';

describe("the shell tool's description (08 §8.2, ADR 0009, 167)", () => {
  it('QA5-H4 it tells the model to use a connector instead of the shell whenever one covers the task, for bash and for powershell', () => {
    const rule = 'use a connector instead of the shell whenever one covers the task';
    expect(shellTool('bash').description).toContain('Runs one bash command');
    expect(shellTool('bash').description).toContain(rule);
    expect(shellTool('powershell').description).toContain('Runs one PowerShell command');
    expect(shellTool('powershell').description).toContain(rule);
  });
});
