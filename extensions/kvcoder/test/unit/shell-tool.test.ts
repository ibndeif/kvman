import { describe, expect, it } from 'vitest';
import { callInput, parseLine } from '../../src/connector-line.ts';
import { connectorExample, shellTool } from '../../src/calls/shell-tool.ts';

describe("the shell tool's description (08 §8.2, ADR 0009, 167 and 172)", () => {
  it('QA5-H4 it explains connectors, shows one example, and says to use a connector instead of the shell whenever one covers the task, for bash and for powershell', () => {
    for (const [name, shell] of [['bash', 'bash'], ['powershell', 'PowerShell']] as const) {
      const tool = shellTool(name);
      expect(tool.description).toContain(`Runs one ${shell} command in the workspace folder and returns its combined output and exit code.`);
      expect(tool.description).toContain("A connector is a word kvcoder runs itself, listed in the system prompt, and it is typed here too: `<connector> <command> '<json>'`, alone on its line (no pipes, &&, ;, or redirection around it).");
      expect(tool.description).toContain(`For example, \`${connectorExample}\` creates a file.`);
      expect(tool.description).toContain('Use a connector instead of the shell whenever one covers the task, and the shell for the rest.');
      expect(tool.description).toContain("`<connector> -h` lists a connector's commands.");
      expect(tool.parameters.properties.command.description).toBe('The shell command, or a connector call.');
    }
  });

  it("QA5-H9 the description's example is a standalone fs call, and its JSON has a path and content", () => {
    const parsed = parseLine(connectorExample, new Set(['fs']));
    expect(parsed).toMatchObject({ kind: 'call', connector: 'fs', stdin: null, async: false });
    const words = parsed.kind === 'call' ? parsed.words : [];
    expect(callInput(words, null, 'fs')).toEqual({ command: 'write', input: { path: 'notes/todo.md', content: '- one\n' } });
  });
});
