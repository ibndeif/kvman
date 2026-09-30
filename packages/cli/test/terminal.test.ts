import { describe, expect, it } from 'vitest';
import { failureLines } from '../src/terminal.ts';

describe('a failed start on the terminal (02 §2.14, ADR 0009, 49)', () => {
  it('M1.8-E24 prints CODE: message, then the hint for its code', () => {
    const hints = {
      KVMAN_RUNNING: 'Use the kvman already running on this home, stop it, or start with --home <dir>. If it is still starting, try again once it has started.',
      PORT_IN_USE: 'Stop what uses the port, or start with --port <n> (0 picks a free one).',
      EXTENSION_INVALID: 'Fix the extension or remove it from the preset. New extension versions need a y at the prompt, or --yes.',
      VALIDATION_FAILED: 'Check the flags (kvman --help), the preset, and its settings.',
      HANDLER_FAILED: 'See logs/kvman.log in the kvman home for details.',
    };
    for (const [code, hint] of Object.entries(hints)) expect(failureLines({ code, message: 'It failed.' })).toBe(`${code}: It failed.\n${hint}\n`);
  });
});
