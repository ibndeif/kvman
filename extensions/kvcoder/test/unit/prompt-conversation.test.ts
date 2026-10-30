import { describe, expect, it } from 'vitest';
import { workingMethod } from '../../src/prompt/working-method.ts';

const talk = 'Talk to the person as you work, the way a colleague does. Every reply that makes a call starts with one short sentence to the person: what you are doing and why, or what you just found and what you do next. Never send a reply that holds only calls.';
const answer = "Your final answer starts with the result, in plain words and as short as the facts allow. Say what you couldn't check, what still runs, or what you noted for later only when it matters for what the person does next.";
const lineOf = (method: string, start: string): string => method.split('\n').find((line) => line.startsWith(start)) ?? '';

describe('a conversation, not a procedure (08 §8.2, ADR 0112)', () => {
  it('QA73-H1 and QA73-E8 the lead talks in every reply with a call, in both methods, and a worker does not', () => {
    for (const [method, decides] of [['engineering', false], ['engineering', true], ['general', false], ['general', true]] as const) expect(workingMethod('lead', method, decides).split('\n')[1]?.startsWith(talk), `${method} ${String(decides)}`).toBe(true);
    for (const method of ['engineering', 'general'] as const) expect(workingMethod('worker', method)).not.toContain('Every reply that makes a call starts with one short sentence to the person');
  });

  it("QA73-H6 Clarify takes the person's go-ahead as an answer, and Map starts on it without asking", () => {
    const lead = workingMethod('lead');
    expect(lineOf(lead, 'Clarify. ').endsWith('The person\'s go-ahead ("do it", "yes", or the option that starts, chosen after you said what you would do) answers what it covers: never ask it again.')).toBe(true);
    const map = lineOf(lead, 'Map. ');
    expect(map.indexOf('When they already told you to go ahead with what the map does')).toBeLessThan(map.indexOf('Otherwise call `ask choice` with other set to true'));
  });

  it('QA73-H7 the final answer gives the result first, and the evidence rule no longer words it', () => {
    expect(lineOf(workingMethod('lead'), 'Finish. ').endsWith(answer)).toBe(true);
    expect(workingMethod('lead', 'general').split('\n')).toContain(answer);
    for (const role of ['lead', 'worker'] as const) {
      expect(workingMethod(role)).toContain('Decide from evidence: every decision and every claim rests on something you read, ran, or were told.\n');
      expect(workingMethod(role)).not.toContain("say what you checked and what you didn't");
    }
    expect(workingMethod('lead')).not.toContain('what you checked and what it showed');
    expect(workingMethod('lead', 'general')).not.toContain('answer briefly');
  });

  it('QA73-E4 Decide for me starts the map without waiting and names no ask', () => {
    const lead = workingMethod('lead', 'engineering', true);
    expect(lineOf(lead, 'Map. ')).toContain("and start: the person asked you to decide, so don't wait for an answer.");
    expect(lead).not.toContain('call `ask');
    expect(lead).not.toContain('go-ahead');
  });

  it('QA73-E9 the rules that keep work safe stay', () => {
    const lead = workingMethod('lead');
    for (const kept of [
      'A bug fix, a change to one or two files, or a fix the person described never gets a map.',
      'ask before any work.',
      '`ask choice` whenever you offer options, your recommended one first',
      'Only when the person asks for the approaches to be debated:',
      "Delegate find, check, and review runs, and change runs only when two or more run at once on files that don't overlap",
      "Before you say that something runs or works, check it the way the person would: run it or request its address; if you couldn't, say what is unchecked.",
      'add a short Commands section to AGENTS.md with risky set to true',
    ]) expect(lead, kept).toContain(kept);
  });
});
