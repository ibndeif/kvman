import { describe, expect, it } from 'vitest';
import { isOpen, part, pressed, ranCard, type Call } from './support/call-fixtures.ts';

const plan: Call = { description: 'Update the plan.', connector: 'execution-map', command: 'set', payload: { goal: 'Ship it.', steps: [] } };
const invalid = 'error VALIDATION_FAILED: steps.0.description: Too big: expected string to have <=500 characters. The payload of execution-map set is\n{ goal, steps: [{ id, title, description, after?, uses?, check }] }';

describe('a failed call reads to the person in a short reason, not its raw input (08 §8.7, ADR 0079)', () => {
  it('M2.4-E303 a request the agent got wrong is quiet: no danger border, "Not run", and a plain reason', async () => {
    const card = await ranCard(plan, invalid, { failed: true });
    expect(isOpen(card)).toBe(false);
    expect(part(card, 'call-card').classes()).not.toContain('kvc-failed');
    expect(part(card, 'call-failed').exists()).toBe(false);
    expect(part(card, 'call-not-run').text()).toBe('Not run');
    expect(part(card, 'call-reason').text()).toBe("The agent's request wasn't valid, so nothing ran.");
    expect(part(card, 'call-card').text()).not.toContain('VALIDATION_FAILED');
  });

  it('M2.4-E304 a denied call stays Failed and says the person denied it', async () => {
    const card = await ranCard({ description: 'Push the branch.', connector: 'shell', command: 'exec', payload: { line: 'git push', risky: true } }, 'denied by the user', { failed: true });
    expect(part(card, 'call-card').classes()).toContain('kvc-failed');
    expect(part(card, 'call-failed').text()).toBe('Failed');
    expect(part(card, 'call-reason').text()).toBe('You denied this call.');
  });

  it('M2.4-E306 Show details reveals the raw error and the request, and Hide details hides them again', async () => {
    const card = await ranCard(plan, invalid, { failed: true });
    await pressed(card);
    expect(part(card, 'call-payload-fields').exists()).toBe(false);
    await part(card, 'call-details').trigger('click');
    expect(part(card, 'call-details').text()).toBe('Hide details');
    expect(part(card, 'call-error').text()).toBe(invalid);
    expect(part(card, 'call-payload-fields').exists()).toBe(true);
    await part(card, 'call-details').trigger('click');
    expect([part(card, 'call-details').text(), part(card, 'call-error').exists()]).toEqual(['Show details', false]);
  });
});
