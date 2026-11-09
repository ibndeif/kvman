// OpenUI's selections (plan 06 §6.1, ADR 0124, 4): a single or multiple choice stored as one value or a list, read with
// its default as OpenUI's `normalizeSelection` does, and toggled as its `toggleSelection` does.

const onlyStrings = (values: readonly unknown[]): string[] => values.filter((value): value is string => typeof value === 'string');

/** The chosen values: the stored value, or else the default. */
export function selectionOf(type: 'single' | 'multiple', stored: unknown, defaultValue: unknown): string[] {
  for (const value of [stored, defaultValue]) {
    if (typeof value === 'string') return value === '' ? [] : [value];
    if (Array.isArray(value)) {
      const strings = onlyStrings(value);
      if (type === 'multiple') return strings;
      const first = strings[0];
      if (first !== undefined) return first === '' ? [] : [first];
    }
  }
  return [];
}

/** The selection after pressing `value`. */
export function toggledSelection(type: 'single' | 'multiple', selection: readonly string[], value: string): string[] {
  if (type === 'single') return selection[0] === value ? [] : [value];
  return selection.includes(value) ? selection.filter((chosen) => chosen !== value) : [...selection, value];
}

/** The selection as OpenUI stores it: one value for a single choice, a list for a multiple one. */
export function storedSelection(type: 'single' | 'multiple', selection: readonly string[]): string | string[] {
  return type === 'single' ? (selection[0] ?? '') : [...selection];
}
