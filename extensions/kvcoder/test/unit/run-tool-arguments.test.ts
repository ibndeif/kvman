import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../../src/prompt/build-prompt.ts';
import { parseRunArgs, runTool } from '../../src/calls/run-tool.ts';

describe('the run tool has no description (08 §8.2, ADR 0089, 1)', () => {
  it('QA57-H1 run takes connector, command, and payload, and the prompt says so', () => {
    const tool = runTool(['shell', 'fs']);
    expect(Object.keys(tool.parameters.properties)).toEqual(['connector', 'command', 'payload']);
    expect(tool.parameters.required).toEqual(['connector', 'command']);
    expect(tool.description).toContain('{ "connector": "fs", "command": "list", "payload": { "path": "src" } }');
    expect(tool.description).not.toContain('description"');
    const { prompt } = buildPrompt({ role: 'lead', workspacePath: '/w', language: 'en', platform: 'linux', shell: 'bash', sections: [], connectors: [] });
    expect(prompt).toContain('Your one tool is run: it runs one command of a connector, as { connector, command, payload }. Below, `fs write` means the connector fs and its command write.');
    expect(prompt).not.toContain('description is one sentence for the person');
    expect(parseRunArgs({ connector: 'fs', command: 'list' })).toEqual({ success: true, data: { connector: 'fs', command: 'list', payload: {} } });
  });

  it('QA57-E1 a call that still sends a description fails and names it', () => {
    const parsed = parseRunArgs({ description: 'Listing files.', connector: 'fs', command: 'list', payload: {} });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.problems).toContain('description');
  });
});
