import { describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

async function noticeText(params: Record<string, unknown>): Promise<string> {
  const wrapper = await mounted(MessageItem, createFakeKvman(), { message: message('notice', { code: 'STEP_FAILED', params: JSON.parse(JSON.stringify(params)) }), commands: new Map() });
  const text = wrapper.find('[data-test="notice"]').text();
  wrapper.unmount();
  return text;
}

describe("a failed step's notice (08 §8.1, ADR 0009, 133)", () => {
  it("QA1-H4 translates the Problem with the Problem's own params", async () => {
    expect(await noticeText({ code: 'kvcoder/NAME_TAKEN', details: { name: 'todo', owner: '@kvman/other' } })).toBe('The turn stopped: The name todo belongs to @kvman/other.');
  });

  it('QA1-E3 a notice stored without details still reads', async () => {
    expect(await noticeText({ code: 'kvai/RATE_LIMITED' })).toBe('The turn stopped: kvai.errors.RATE_LIMITED');
  });

  it('QA3-H24 says why the call failed, after the sentence', async () => {
    expect(await noticeText({ code: 'kvcoder/NAME_TAKEN', details: { name: 'todo', owner: '@kvman/other', reason: 'Request timed out.' } })).toBe('The turn stopped: The name todo belongs to @kvman/other. Request timed out.');
  });

  it('QA3-E26 cuts a long reason at 200 characters, and a failure with no reason reads as before', async () => {
    const text = await noticeText({ code: 'kvcoder/NAME_TAKEN', details: { name: 'todo', owner: '@kvman/other', reason: 'x'.repeat(500) } });
    expect(text).toBe(`The turn stopped: The name todo belongs to @kvman/other. ${'x'.repeat(200)}…`);
    expect(await noticeText({ code: 'kvcoder/NAME_TAKEN', details: { name: 'todo', owner: '@kvman/other', reason: '  ' } })).toBe('The turn stopped: The name todo belongs to @kvman/other.');
  });
});
