import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnsweredCard from '../../web/src/AnsweredCard.vue';
import RecordCard from '../../web/src/RecordCard.vue';
import { createFakeKvman } from './support/fake-kvman.ts';
import { mounted } from './support/fixtures.ts';

// The record card (08 §8.7, ADR 0115, 25, 27, and 29) with a stand-in microphone, recorder, and upload; the real
// microphone and recorder are in the e2e project.

class FakeRecorder extends EventTarget {
  static isTypeSupported = (type: string): boolean => type === 'audio/webm;codecs=opus';
  state: 'inactive' | 'recording' = 'inactive';
  mimeType: string;
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    super();
    this.mimeType = options?.mimeType ?? 'audio/webm';
  }
  start(): void {
    this.state = 'recording';
  }
  stop(): void {
    this.state = 'inactive';
    this.dispatchEvent(Object.assign(new Event('dataavailable'), { data: new Blob(['take']) }));
    this.dispatchEvent(new Event('stop'));
  }
}

const question = { kind: 'record', prompt: 'Record scene 1', tone: 'warm', pace: 'relaxed', lines: [{ text: 'This is Notes, then sign in.', stress: ['notes'], pauses: ['in'], seconds: 5 }], exampleFileIds: ['ex1'] };

function microphone(getUserMedia: () => Promise<unknown>): void {
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
  vi.stubGlobal('MediaRecorder', FakeRecorder);
  vi.stubGlobal('AudioContext', undefined);
  URL.createObjectURL = vi.fn(() => 'blob:take');
  URL.revokeObjectURL = vi.fn();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('the record card (08 §8.7, ADR 0115)', () => {
  it('M5.10-H3 the line with its stressed words, pauses, tone, pace, length, and example', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const card = await mounted(RecordCard, createFakeKvman(), { questionId: 'q1', question });
    expect(card.findAll('[data-test="record-stress"]').map((stressed) => stressed.text())).toEqual(['Notes']);
    expect(card.findAll('[data-test="record-pause"]')).toHaveLength(1);
    expect(card.find('[data-test="record-how"]').text()).toBe('Tone: warm · Pace: relaxed');
    expect(card.find('[data-test="record-seconds"]').text()).toBe('about 5 s');
    expect(card.find('[data-test="record-use"]').attributes('disabled')).toBeDefined();
    await card.find('[data-test="record-example"]').trigger('click');
    expect(card.find('audio').attributes('src')).toContain('/api/files/ex1?workspaceId=');
    expect(play).toHaveBeenCalled();
  });

  it('M5.10-H4 Record counts down, records, stops, and the takes are uploaded and answered', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    microphone(() => Promise.resolve({ getTracks: () => [{ stop: vi.fn() }] }));
    const fetch = vi.fn(async (_address: string) => Response.json({ file: { id: 'u1' } }));
    vi.stubGlobal('fetch', fetch);
    const card = await mounted(RecordCard, createFakeKvman(), { questionId: 'q1', question });
    await card.find('[data-test="record-start"]').trigger('click');
    await flushPromises();
    expect(card.find('[data-test="record-countdown"]').text()).toBe('3');
    for (const shown of ['2', '1']) {
      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(card.find('[data-test="record-countdown"]').text()).toBe(shown);
    }
    vi.advanceTimersByTime(1000);
    await flushPromises();
    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(card.find('[data-test="record-time"]').text()).toBe('Recording 0:01');
    await card.find('[data-test="record-stop"]').trigger('click');
    await flushPromises();
    expect(card.find('[data-test="record-take"]').text()).toBe('Take 0:01');
    expect(card.find('[data-test="record-again"]').exists()).toBe(true);
    await card.find('[data-test="record-use"]').trigger('click');
    await flushPromises();
    expect(String(fetch.mock.calls[0]?.[0])).toContain('name=line-1.webm');
    expect(card.emitted('answer')).toEqual([[{ questionId: 'q1', answer: { takes: [{ fileId: 'u1', durationMs: 1000 }] } }]]);
  });

  it('M5.10-H5 the answered card lists each line with its take length', async () => {
    const answered = { kind: 'record', question: { prompt: 'Record', lines: [{ text: 'One.' }, { text: 'Two.' }] }, answer: { takes: [{ file: 'v/line-1.webm', durationMs: 2100 }, { file: 'v/line-2.webm', durationMs: 3400 }] } };
    const card = await mounted(AnsweredCard, createFakeKvman(), { answered });
    expect(card.findAll('[data-test="answered-takes"] li').map((line) => line.text())).toEqual(['One.0:02', 'Two.0:03']);
  });

  it('M5.10-E3 no microphone, or a refused one, says so and offers the browser', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined });
    const none = await mounted(RecordCard, createFakeKvman(), { questionId: 'q1', question });
    await none.find('[data-test="record-start"]').trigger('click');
    await flushPromises();
    expect(none.find('[data-test="record-trouble"]').text()).toContain("The microphone can't be opened here.");
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await none.find('[data-test="record-browser"]').trigger('click');
    expect(open).toHaveBeenCalledWith(window.location.href, '_blank', 'noopener');
    expect(none.find('[data-test="record-upload"]').exists()).toBe(true);
    microphone(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const refused = await mounted(RecordCard, createFakeKvman(), { questionId: 'q2', question });
    await refused.find('[data-test="record-start"]').trigger('click');
    await flushPromises();
    expect(refused.find('[data-test="record-trouble"]').text()).toContain('Microphone access was refused.');
  });

  it('M5.10-E4 a file that is not sound is refused with a toast', async () => {
    const fake = createFakeKvman();
    const card = await mounted(RecordCard, fake, { questionId: 'q1', question });
    const input = card.find('[data-test="record-file"]');
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], 'shot.png', { type: 'image/png' })] });
    await input.trigger('change');
    await flushPromises();
    expect(fake.toast).toHaveBeenCalledWith('kvcoder.ui.record.notSound', { name: 'shot.png' }, 'error');
    expect(card.find('[data-test="record-take"]').exists()).toBe(false);
  });
});
