import { afterEach, describe, expect, it, vi } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { settle } from '../schedules/harness.ts';
import { enable, grantsOf, valueOf } from '../workspaces/harness.ts';
import { i18nTests, lingoName, locales, openLingoFixture, setLocale } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function openEnabled(): Promise<InstallFixture> {
  const opened = await openLingoFixture();
  valueOf(await enable(opened, workspaceA, lingoName, grantsOf(opened, lingoName)));
  await opened.runtime.schedules.settled();
  return opened;
}

async function expectLocales(current: InstallFixture, expected: Record<string, string>): Promise<void> {
  await vi.waitFor(async () => expect(await locales(current, workspaceA)).toMatchObject(expected));
}

describe('message locale inheritance', i18nTests, () => {
  it('M2.11-H3 inherits the locale through all three commands in each new chain', async () => {
    fixture = await openEnabled();
    await setLocale(fixture, 'ar');
    valueOf(await command(fixture, 'lingo.start', {}, person, workspaceA));
    await expectLocales(fixture, { start: 'ar', relay: 'ar', finish: 'ar' });

    await setLocale(fixture, 'en');
    valueOf(await command(fixture, 'lingo.start', {}, person, workspaceA));
    await expectLocales(fixture, { start: 'en', relay: 'en', finish: 'en' });
  });

  it('M2.11-E39 keeps the old correlation locale on a delayed send', async () => {
    fixture = await openEnabled();
    await setLocale(fixture, 'ar');
    valueOf(await command(fixture, 'lingo.start', { delayMs: 60_000 }, person, workspaceA));
    expect(await locales(fixture, workspaceA)).toEqual({ start: 'ar', relay: 'ar' });

    await setLocale(fixture, 'en');
    fixture.timers.advance(60_000);
    await expectLocales(fixture, { finish: 'ar' });
    valueOf(await command(fixture, 'lingo.start', {}, person, workspaceA));
    await expectLocales(fixture, { start: 'en', relay: 'en', finish: 'en' });
  });

  // ADR 0161: a schedule's run carries the locale saved when it is admitted, at enable here.
  it('M2.11-E40 gives a root schedule the saved locale and refuses changing it in a send', async () => {
    fixture = await openLingoFixture();
    await setLocale(fixture, 'ar');
    valueOf(await enable(fixture, workspaceA, lingoName, grantsOf(fixture, lingoName)));
    await fixture.runtime.schedules.settled();
    const untilNextHour = 3_600_000 - (fixture.timers.time.value % 3_600_000);
    fixture.timers.advance(untilNextHour);
    await settle(fixture.runtime, fixture.connection, () => fixture?.timers.time.value ?? 0);
    await expectLocales(fixture, { tick: 'ar' });

    expect(problemOf(await command(fixture, 'lingo.start', { contextLocale: 'en' }, person, workspaceA)))
      .toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
