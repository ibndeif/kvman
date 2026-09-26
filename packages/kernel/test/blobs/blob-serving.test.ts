import { describe, expect, it } from 'vitest';
import { imageServing, isInlineCandidate, textServing } from '../../src/index.ts';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);
const ascii = (text: string): Uint8Array => new TextEncoder().encode(text);

async function* chunks(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield part;
}

describe('content sniffing (plan 13 §13.7, ADR 0138)', () => {
  it('M2.5-E22 inline only when the stored mime is allowlisted and the bytes match it', async () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
    expect(imageServing('image/png', png)).toEqual({ inline: true, contentType: 'image/png' });
    expect(imageServing('image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({ inline: true, contentType: 'image/jpeg' });
    expect(imageServing('image/gif', ascii('GIF89a......'))).toEqual({ inline: true, contentType: 'image/gif' });
    expect(imageServing('image/webp', ascii('RIFF\u0000\u0000\u0000\u0000WEBP'))).toEqual({ inline: true, contentType: 'image/webp' });
    expect(imageServing('image/webp', ascii('RIFF\u0000\u0000\u0000\u0000WAVE'))).toEqual({ inline: false });
    expect(imageServing('image/png', png.subarray(0, 4))).toEqual({ inline: false });
    expect(imageServing('image/png', bytes(0xff, 0xd8, 0xff))).toEqual({ inline: false });
    expect(imageServing('image/png', ascii('<html><script>'))).toEqual({ inline: false });
    expect(imageServing('image/svg+xml', ascii('<svg>'))).toEqual({ inline: false });
    expect([isInlineCandidate('text/plain'), isInlineCandidate('image/png'), isInlineCandidate('text/html'), isInlineCandidate('application/pdf')]).toEqual([true, true, false, false]);
    const split = ascii('مرحبا');
    expect(await textServing(chunks(split.subarray(0, 3), split.subarray(3)))).toEqual({ inline: true, contentType: 'text/plain; charset=utf-8' });
    expect(await textServing(chunks(bytes(0xc3, 0x28)))).toEqual({ inline: false });
    expect(await textServing(chunks(ascii('a'), bytes(0), ascii('b')))).toEqual({ inline: false });
    expect(await textServing(chunks(bytes(0xd9)))).toEqual({ inline: false });
  });
});
