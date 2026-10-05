import { ProblemError, type Json } from '@kvman/sdk';
import type { FakeKvman } from './fake-kvman.ts';

/** A setting's values as the kernel keeps them: one per scope, over a default. */
export type ScopedValues = { default: Json; global?: Json; workspace?: Json };

/** Answers `kernel.settings.list`, `set`, and `reset` for the given keys, resolving each value workspace first; `fail` makes every `set` fail. */
export function serveSettings(fake: FakeKvman, settings: Record<string, ScopedValues>, fail = false): void {
  fake.handle('kernel.settings.list', () =>
    Object.entries(settings).map(([key, values]) => ({
      key,
      value: 'workspace' in values ? values.workspace : 'global' in values ? values.global : values.default,
      source: 'workspace' in values ? 'workspace' : 'global' in values ? 'global' : 'default',
    })),
  );
  const scopeOf = (input: Record<string, unknown>) => (input['scope'] === 'workspace' ? 'workspace' : 'global');
  fake.handle('kernel.settings.set', (input) => {
    const values = settings[String(input['key'])];
    if (fail || values === undefined) throw new ProblemError({ code: 'VALIDATION_FAILED', message: 'Not valid.' });
    values[scopeOf(input)] = input['value'] as Json;
    return {};
  });
  fake.handle('kernel.settings.reset', (input) => {
    delete settings[String(input['key'])]?.[scopeOf(input)];
    return {};
  });
}

/** The writes a test made, without the reads. */
export const settingWrites = (fake: FakeKvman) => fake.calls.filter((call) => call.name === 'kernel.settings.set' || call.name === 'kernel.settings.reset');
