import { afterEach, describe, expect, it } from 'vitest';
import type { Json, Problem } from '@kvman/protocol';
import { workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { eventsOf, enable, grantsOf, query, valueOf } from '../workspaces/harness.ts';
import { lingoName, openLingoFixture } from '../i18n/harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function preferenceRow(current: InstallFixture): Record<string, unknown> | undefined {
  return current.connection.prepare('SELECT data, revision FROM user_preferences WHERE user_id = ?').get('local');
}

async function preferences(current: InstallFixture): Promise<unknown> {
  return query(current, 'kernel.user.preferences.get', {}, person);
}

let invalidKeys = 0;

async function invalidSet(current: InstallFixture, payload: Json): Promise<Problem> {
  invalidKeys += 1;
  const submission = await current.runtime.submitCommand({
    sender: person, idempotencyKey: `invalid-preference-${invalidKeys}`, type: 'kernel.user.preferences.set', payload,
  });
  if (!submission.ok) return submission.problem;
  return problemOf(await current.runtime.awaitReply(submission.id));
}

describe('user preferences (ADR 0161)', { timeout: 120_000 }, () => {
  it('M2.11-E34 returns the defaults for a fresh home', async () => {
    fixture = await openLingoFixture();
    expect(await preferences(fixture)).toEqual({ ok: true, value: { locale: 'en', theme: 'app', desktopAlerts: false } });
    expect(preferenceRow(fixture)).toBeUndefined();
  });

  it('M2.11-E35 canonicalizes changes and does not write or publish for no-op sets', async () => {
    fixture = await openLingoFixture();
    expect(valueOf(await command(fixture, 'kernel.user.preferences.set', { locale: 'en-us' }))).toEqual({});
    expect(preferenceRow(fixture)).toMatchObject({ revision: 1, data: JSON.stringify({ locale: 'en-US', theme: 'app', desktopAlerts: false }) });
    expect(eventsOf(fixture, 'kernel.user.preferences.changed')).toEqual([
      { workspaceId: null, payload: { locale: 'en-US', theme: 'app', desktopAlerts: false } },
    ]);

    expect(valueOf(await command(fixture, 'kernel.user.preferences.set', { locale: 'en-us' }))).toEqual({});
    expect(preferenceRow(fixture)?.['revision']).toBe(1);
    expect(eventsOf(fixture, 'kernel.user.preferences.changed')).toHaveLength(1);

    expect(valueOf(await command(fixture, 'kernel.user.preferences.set', { theme: 'dark', desktopAlerts: true }))).toEqual({});
    expect(preferenceRow(fixture)?.['revision']).toBe(2);
    expect(eventsOf(fixture, 'kernel.user.preferences.changed')).toEqual([
      { workspaceId: null, payload: { locale: 'en-US', theme: 'app', desktopAlerts: false } },
      { workspaceId: null, payload: { locale: 'en-US', theme: 'dark', desktopAlerts: true } },
    ]);

    expect(valueOf(await command(fixture, 'kernel.user.preferences.set', {}))).toEqual({});
    expect(preferenceRow(fixture)?.['revision']).toBe(2);
    expect(eventsOf(fixture, 'kernel.user.preferences.changed')).toHaveLength(2);
  });

  it('M2.11-E36 rejects invalid preferences without changing anything', async () => {
    fixture = await openLingoFixture();
    const tooLong = 'en-x-aaaaaaaa-bbbbbbbb-cccccccc-dddddddd-eeeeeeee-ffffffff-gggggg';
    for (const payload of [{ locale: 'not a tag!' }, { theme: 'blue' }, { color: 'red' }, { locale: tooLong }]) {
      expect(await invalidSet(fixture, payload)).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(preferenceRow(fixture)).toBeUndefined();
      expect(eventsOf(fixture, 'kernel.user.preferences.changed')).toEqual([]);
      expect(await preferences(fixture)).toEqual({ ok: true, value: { locale: 'en', theme: 'app', desktopAlerts: false } });
    }
  });

  it('M2.11-E37 lets an extension read preferences but not change them', async () => {
    fixture = await openLingoFixture();
    valueOf(await enable(fixture, workspaceA, lingoName, grantsOf(fixture, lingoName)));
    expect(valueOf(await command(fixture, 'lingo.prefer', { locale: 'ar' }, person, workspaceA))).toEqual({ code: 'CALLER_NOT_ALLOWED' });
    expect(valueOf(await command(fixture, 'lingo.preferences.read', {}, person, workspaceA))).toEqual({ locale: 'en', theme: 'app', desktopAlerts: false });
    expect(preferenceRow(fixture)).toBeUndefined();
  });
});
