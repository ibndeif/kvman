import { afterEach, describe, expect, it } from 'vitest';
import MessageItem from '../../web/src/MessageItem.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { message, mounted } from './support/fixtures.ts';

afterEach(() => {
  document.documentElement.lang = '';
});

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

  it('QA10-H13 a JSON error body shows as its message', async () => {
    const failed = { code: 'kvai/PROVIDER_ERROR', details: { model: 'zed/z1', reason: '403: {"message":"This model requires you to complete the following before use: 18+ age confirmation.","code":403}' } };
    const text = await noticeText(failed);
    expect(text).toBe('The turn stopped: kvai.errors.PROVIDER_ERROR 403: This model requires you to complete the following before use: 18+ age confirmation.');
    expect(text).not.toContain('{"message"');

    expect(await noticeText({ code: 'kvai/PROVIDER_ERROR', details: { model: 'zed/z1', reason: 'Request timed out.' } })).toBe('The turn stopped: kvai.errors.PROVIDER_ERROR Request timed out.');
    expect(await noticeText({ code: 'kvai/PROVIDER_ERROR', details: { model: 'zed/z1', reason: '{"message":"say \\"hi\\""}' } })).toBe('The turn stopped: kvai.errors.PROVIDER_ERROR say "hi"');
  });

  it("QA10-H14 in Arabic a notice's names and reason are isolated, in English they are not", async () => {
    const params = { code: 'kvcoder/NAME_TAKEN', details: { name: 'zed/z1', owner: '@kvman/kvai', reason: '403: {"message":"Needs confirmation.","code":403}' } };
    document.documentElement.lang = 'ar';
    const isolated = await noticeText(params);
    expect(isolated).toBe('The turn stopped: The name \u2068zed/z1\u2069 belongs to \u2068@kvman/kvai\u2069. \u2068403: Needs confirmation.\u2069');
    document.documentElement.lang = '';
    const plain = await noticeText(params);
    expect(plain).toBe('The turn stopped: The name zed/z1 belongs to @kvman/kvai. 403: Needs confirmation.');
    expect(plain).not.toMatch(/[\u2066-\u2069]/u);
  });
});
