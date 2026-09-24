export const bindingRoots = [
  'route', 'query', 'state', 'form', 'item', 'value', 'selection', 'upload', 'reply', 'slot', 'props', 't', 'locale',
  'workspace', 'user', 'app',
] as const;

export type BindingRoot = (typeof bindingRoots)[number];

export type BindingPath = { root: BindingRoot; segments: string[] };

export type BindingParse = { ok: true; path: BindingPath } | { ok: false; message: string };

const rootsNeedingSegment: readonly string[] = ['query', 't'];
const segmentPattern = /^[A-Za-z0-9_-]+$/;
const indexWithLeadingZero = /^0[0-9]+$/;
const interpolationPattern = /\{\{\s*([^{}]*?)\s*\}\}/g;

function isBindingRoot(root: string): root is BindingRoot {
  return (bindingRoots as readonly string[]).includes(root);
}

export function isBindingText(text: string): boolean {
  return text.startsWith('$') && !text.startsWith('$$');
}

export function parseBindingPath(text: string): BindingParse {
  if (!text.startsWith('$')) return { ok: false, message: `"${text}" is not a binding: bindings start with "$"` };
  const [root = '', ...segments] = text.slice(1).split('.');
  if (!isBindingRoot(root)) {
    return { ok: false, message: `"$${root}" is not a binding root; use one of ${bindingRoots.map((name) => `$${name}`).join(', ')}` };
  }
  if (rootsNeedingSegment.includes(root) && segments.length === 0) {
    return { ok: false, message: `"$${root}" needs a segment, e.g. "$${root}.name"` };
  }
  const bad = segments.find((segment) => !segmentPattern.test(segment) || indexWithLeadingZero.test(segment));
  if (bad !== undefined) {
    return { ok: false, message: `"${bad}" in "${text}" is not a binding segment (letters, digits, "_" and "-"; indexes without leading zeros)` };
  }
  return { ok: true, path: { root, segments } };
}

export function bindingProblems(text: string): string[] {
  const whole = isBindingText(text) ? [parseBindingPath(text)] : [];
  const interpolated = [...text.matchAll(interpolationPattern)].map((match) => parseBindingPath(match[1] ?? ''));
  return [...whole, ...interpolated].flatMap((parse) => (parse.ok ? [] : [parse.message]));
}
