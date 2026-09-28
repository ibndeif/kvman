import { localeSchema, storedPreferencesSchema, type StoredPreferences, type UserPreferences } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

// v2 has one local user, `user:local` (02 §2.1); its row in user_preferences (04 §4.1).
export const localUserId = 'local';

// ADR 0161: the values before anything is saved (08 §8.16: `en`, the app's theme, desktop alerts opt-in).
const defaults: UserPreferences = { locale: 'en', theme: 'app', desktopAlerts: false };

// Every message context carries the locale, so a saved tag stays short (ADR 0161).
const maxLocaleLength = 64;

// The stored row: the preferences and the muted extensions per workspace (ADR 0163).
export function readStoredPreferences(connection: Pick<Connection, 'prepare'>): StoredPreferences {
  const row = connection.prepare('SELECT data FROM user_preferences WHERE user_id = ?').get(localUserId);
  return row === undefined ? defaults : storedPreferencesSchema.parse(JSON.parse(String(row['data'])));
}

export function readPreferences(connection: Pick<Connection, 'prepare'>): UserPreferences {
  const { locale, theme, desktopAlerts } = readStoredPreferences(connection);
  return { locale, theme, desktopAlerts };
}

// ADR 0163: the extensions whose notifications are muted in a workspace; the global entries are never muted.
export function mutedExtensions(connection: Pick<Connection, 'prepare'>, workspaceId: string): readonly string[] {
  if (workspaceId === '') return [];
  return readStoredPreferences(connection).muted?.[workspaceId] ?? [];
}

// ADR 0161: any tag Intl accepts, stored in its canonical form (`en-us` → `en-US`); `undefined` when it is not a
// language tag kvman can carry.
export function canonicalLocale(tag: string): string | undefined {
  let canonical: string[];
  try {
    canonical = Intl.getCanonicalLocales(tag);
  } catch (error) {
    if (error instanceof RangeError) return undefined;
    throw error;
  }
  const [first] = canonical;
  return first !== undefined && first.length <= maxLocaleLength && localeSchema.safeParse(first).success ? first : undefined;
}

// The saved language, read at boot and after each committed set, which admission gives every message that
// inherits no locale (02 §2.10, ADR 0161).
export class SavedPreferences {
  readonly #connection: Pick<Connection, 'prepare'>;
  #locale: string;

  constructor(connection: Pick<Connection, 'prepare'>) {
    this.#connection = connection;
    this.#locale = readPreferences(connection).locale;
  }

  locale(): string {
    return this.#locale;
  }

  read(): UserPreferences {
    return readPreferences(this.#connection);
  }

  refresh(): void {
    this.#locale = readPreferences(this.#connection).locale;
  }
}
