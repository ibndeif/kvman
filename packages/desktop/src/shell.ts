// What the home screen's page gets from the shell and asks of it (plan 14 §14.5). The shell's Rust side makes every
// call to kvman; the page only shows what it is given.

export type HomeRow = { id: string; name: string; folder: string; home: boolean };

export type Theme = 'light' | 'dark' | 'system';

export type HomeView = {
  language: 'en' | 'ar';
  theme: Theme;
  texts: Readonly<Record<string, string>>;
  rows: readonly HomeRow[];
  // The text of the call that failed last, shown above the list.
  failure: string | null;
};

export type Shell = {
  // Resolves once kvman runs.
  load(): Promise<HomeView>;
  continueInto(workspaceId: string): Promise<void>;
  remove(workspaceId: string): Promise<HomeView>;
  // Resolves to the screen as it is when no folder was opened; when one was, the window has moved on.
  openFolder(): Promise<HomeView>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRow(value: unknown): value is HomeRow {
  return isRecord(value) && typeof value['id'] === 'string' && typeof value['name'] === 'string' && typeof value['folder'] === 'string' && typeof value['home'] === 'boolean';
}

function isTexts(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((text) => typeof text === 'string');
}

export function readHomeView(value: unknown): HomeView {
  if (!isRecord(value)) throw new TypeError('The shell answered something that is not a home screen.');
  const { language, theme, texts, rows, failure } = value;
  const known =
    (language === 'en' || language === 'ar') &&
    (theme === 'light' || theme === 'dark' || theme === 'system') &&
    isTexts(texts) &&
    Array.isArray(rows) &&
    rows.every(isRow) &&
    (failure === null || typeof failure === 'string');
  if (!known) throw new TypeError('The shell answered a home screen of another shape.');
  return { language, theme, texts, rows, failure };
}
