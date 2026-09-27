// 07 §7.4, ADR 0149: kernel.preset.save derives the catalog id from the given name.
export function presetIdFor(name: string, taken: (id: string) => boolean): string {
  const dashed = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const trimmed = dashed.replace(/^-+|-+$/g, '');
  const base = trimmed === '' ? 'preset' : trimmed;
  if (!taken(fit(base, 64))) return fit(base, 64);
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${fit(base, 64 - suffix.length)}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
}

function fit(base: string, limit: number): string {
  return base.slice(0, limit).replace(/-+$/, '');
}
