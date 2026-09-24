import { describe, expect, it } from 'vitest';
import { priorityCodes } from '../../src/index.ts';
import { agentProcess, messageRows, openRouterFixture, personCommand } from './harness.ts';

describe('a handler\'s declared priority (plan 02 §2.6, ADR 0065)', () => {
  it('M1.5-E23 the declared priority stands in for a missing request and is capped like one', async () => {
    const fixture = openRouterFixture();
    const plain = await personCommand(fixture, { type: 'pdf.archive', payload: {} });
    const requested = await personCommand(fixture, { type: 'pdf.archive', payload: {}, priority: 'normal' });
    const fromProcess = await personCommand(fixture, { type: 'agent.plan', payload: {} }, agentProcess);
    const priorityOf = (submission: typeof plain): unknown => messageRows(fixture, 'id = ?', submission.ok ? submission.id : '')[0]?.['priority'];
    expect(priorityOf(plain)).toBe(priorityCodes.background);
    expect(priorityOf(requested)).toBe(priorityCodes.normal);
    expect(priorityOf(fromProcess)).toBe(priorityCodes.normal);
  });
});
