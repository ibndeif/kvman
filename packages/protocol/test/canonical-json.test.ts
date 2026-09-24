import { describe, expect, it } from 'vitest';
import { canonicalJson, requestDigest, sha256Hex, type JsonObject } from '../src/index.ts';

describe('canonical JSON and digest (plan 02 §2.7, 05 §5.12, ADR 0009)', () => {
  it('M0.2-E16 key order does not matter; array order does; no whitespace', () => {
    const left = { b: 1, a: { d: [3, { y: true, x: null }], c: 'text' } };
    const right = { a: { c: 'text', d: [3, { x: null, y: true }] }, b: 1 };
    expect(canonicalJson(left)).toBe('{"a":{"c":"text","d":[3,{"x":null,"y":true}]},"b":1}');
    expect(canonicalJson(right)).toBe(canonicalJson(left));
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('M0.2-E17 keys are sorted by UTF-16 code unit', () => {
    expect(canonicalJson({ b: 1, B: 2, '😀': 3, '～': 4, a: 5 })).toBe('{"B":2,"a":5,"b":1,"😀":3,"～":4}');
  });

  it('M0.2-E18 undefined properties are left out', () => {
    const withUndefined = JSON.parse('{"a":1}') as JsonObject;
    Object.assign(withUndefined, { b: undefined });
    expect(canonicalJson(withUndefined)).toBe('{"a":1}');
  });

  it('M0.2-E19 sha256Hex matches the FIPS 180-2 test vector', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('M0.2-E20 the request digest ignores key order and follows the payload', async () => {
    const workspaceId = 'a'.repeat(64);
    const first = await requestDigest({ type: 'pdf.translate', workspaceId, lane: 'file:f1', payload: { fileId: 'f1', lang: 'ar' } });
    const reordered = await requestDigest({ type: 'pdf.translate', workspaceId, lane: 'file:f1', payload: { lang: 'ar', fileId: 'f1' } });
    const changed = await requestDigest({ type: 'pdf.translate', workspaceId, lane: 'file:f1', payload: { fileId: 'f1', lang: 'fr' } });
    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });
});
