import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eventually, kv, objectOf, openHostFixture, rows, value, type HostFixture } from './harness.ts';

let fixture: HostFixture;
beforeEach(() => {
  fixture = openHostFixture();
});
afterEach(() => fixture.close());

function touchPhases(id: string): unknown[] {
  return fixture.live.filter((frame) => frame.type === 'audit.touch.noted' && frame.key === id).map((frame) => frame.chunk);
}

describe('events in shared hosts (plan 02 §2.3, §2.5, ADR 0069)', () => {
  it('M1.6-H3 a durable event reaches its subscriber through an inbox row', async () => {
    const id = String(objectOf(await value(fixture, 'notes.add', { text: 'hi' }))['id']);
    expect(rows(fixture, "SELECT type FROM events WHERE type = 'notes.added'")).toHaveLength(1);
    await eventually(() => expect(kv(fixture, '@acme/audit', `added:${id}`)).toBe(true));
    await eventually(() => expect(rows(fixture, "SELECT state FROM messages WHERE handler = '@acme/audit|subscription:notes.added'")).toEqual([{ state: 'done' }]));
  });

  it('M1.6-H4 a transient event reaches its subscriber without a row', async () => {
    await value(fixture, 'notes.touch', { id: 'n1', step: 1 });
    await eventually(() => expect(kv(fixture, '@acme/audit', 'touched:n1:1')).toBe(true));
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'notes.touched'")).toEqual([]);
    expect(rows(fixture, "SELECT id FROM events WHERE type = 'notes.touched'")).toEqual([]);
  });

  it('M1.6-E23 a transient delivery that fails is not retried and leaves no row', async () => {
    await value(fixture, 'notes.touch', { id: 'boom', step: 1 });
    await eventually(() => expect(touchPhases('boom')).toEqual([{ data: { phase: 'start', step: 1 } }, { reset: true }]));
    fixture.timers.advance(60_000);
    await value(fixture, 'notes.touch', { id: 'after', step: 1 });
    await eventually(() => expect(kv(fixture, '@acme/audit', 'touched:after:1')).toBe(true));
    expect(touchPhases('boom')).toHaveLength(2);
    expect(rows(fixture, "SELECT id FROM messages WHERE type = 'notes.touched'")).toEqual([]);
  });

  it('M1.6-E24 a transient delivery keeps its lane', async () => {
    await value(fixture, 'notes.touch', { id: 'n2', step: 1 });
    await value(fixture, 'notes.touch', { id: 'n2', step: 2 });
    await eventually(() => expect(kv(fixture, '@acme/audit', 'touched:n2:2')).toBe(true));
    expect(touchPhases('n2').map((chunk) => JSON.stringify(chunk))).toEqual([
      { data: { phase: 'start', step: 1 } }, { data: { phase: 'end', step: 1 } }, { data: { phase: 'start', step: 2 } }, { data: { phase: 'end', step: 2 } },
    ].map((chunk) => JSON.stringify(chunk)));
  });

  it('M1.6-E25 a delivery of its own event is parsed with its Zod schema', async () => {
    const id = String(objectOf(await value(fixture, 'notes.add', { text: 'hi' }))['id']);
    await eventually(() => expect(kv(fixture, '@acme/notes', `added-source:${id}`)).toBe('user'));
  });
});
