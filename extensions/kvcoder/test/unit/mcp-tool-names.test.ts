import { ProblemError } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { toolNamed } from '../../src/mcp/tools.ts';

const tools = ['browser_click', 'browser_run_code_unsafe', 'browser_navigate'].map((name) => ({ name, inputSchema: {} }));

function failure(name: string): string {
  try {
    toolNamed('playwright', tools, name);
  } catch (error) {
    if (error instanceof ProblemError) return error.problem.message;
    throw error;
  }
  throw new Error('The tool was found.');
}

describe("an MCP tool's near names (08 §8.5, ADR 0102, 8)", () => {
  it('QA67-H16 a tool not found names the near ones first, then all', () => {
    expect(failure('browser_run_code')).toBe('playwright has no tool browser_run_code. Did you mean browser_run_code_unsafe? Its tools are: browser_click, browser_run_code_unsafe, browser_navigate.');
  });

  it('QA67-E18 with no near name it lists the tools only', () => {
    expect(failure('foo')).toBe('playwright has no tool foo. Its tools are: browser_click, browser_run_code_unsafe, browser_navigate.');
  });
});
