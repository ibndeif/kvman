import { preferencesSetRequestSchema, type UserPreferences } from '@kvman/protocol';
import { canonicalLocale, type SavedPreferences } from '../preferences/user-preferences.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import { parsed, refusal } from './command-payloads.ts';
import type { KernelCommits } from './kernel-commits.ts';
import type { SerialChanges } from './serial-changes.ts';

export type PreferenceCommandsDeps = { commits: KernelCommits; preferences: SavedPreferences; serial: SerialChanges };

function same(left: UserPreferences, right: UserPreferences): boolean {
  return left.locale === right.locale && left.theme === right.theme && left.desktopAlerts === right.desktopAlerts;
}

// kernel.user.preferences.set (08 §8.16, ADR 0161): admission lets only a person send it (`access: 'user'`); a set
// that changes nothing answers without a write or an event.
export class PreferenceCommands {
  readonly #deps: PreferenceCommandsDeps;

  constructor(deps: PreferenceCommandsDeps) {
    this.#deps = deps;
  }

  set(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#set(claim));
  }

  async #set(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(preferencesSetRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const current = this.#deps.preferences.read();
    const locale = request.value.locale === undefined ? current.locale : canonicalLocale(request.value.locale);
    if (locale === undefined) {
      const issue = { path: 'locale', message: `${request.value.locale ?? ''} is not a language tag of at most 64 characters`, hint: 'send a BCP 47 tag such as "en" or "ar-u-nu-latn"' };
      return this.#deps.commits.fail(claim, refusal(message, 'VALIDATION_FAILED', { detail: issue.message, issues: [issue] }));
    }
    const next: UserPreferences = { locale, theme: request.value.theme ?? current.theme, desktopAlerts: request.value.desktopAlerts ?? current.desktopAlerts };
    if (same(next, current)) {
      await this.#deps.commits.reply(claim, {});
      return;
    }
    const result = await this.#deps.commits.commit({
      origin: { kind: 'change', change: { kind: 'preferences.set', preferences: next }, command: message, correlationId: message.correlationId },
      writes: [], sends: [], publishes: [], replies: [],
    }, claim);
    if (result.committed) this.#deps.preferences.refresh();
  }
}
