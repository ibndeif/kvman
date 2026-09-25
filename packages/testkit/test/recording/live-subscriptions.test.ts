import { describe, expect, it } from 'vitest';
import { issuePaths, recordingProblem } from './harness.ts';

describe('subscriptions to live events (plan 05 §5.3, ADR 0068)', () => {
  it('M1.6-H11 a subscription to its own live event fails recording', () => {
    const problem = recordingProblem((ext) => {
      ext.registerEvent('demo.tokens.generated', { description: 'Tokens as they stream.', delivery: 'live', chunk: 'text' });
      ext.subscribe('demo.tokens.generated', { description: 'Reads its own tokens.', handle: async () => undefined });
    }, 'demo');
    expect(problem.code).toBe('EXT_MANIFEST_INVALID');
    expect(issuePaths(problem)).toEqual(['subscriptions.0.event']);
  });
});
