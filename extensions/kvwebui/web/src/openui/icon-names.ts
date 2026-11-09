import { iconNames } from '../contributions/icons.ts';

// OpenUI's icon fallbacks (plan 06 §6.1, ADR 0124, 8): when a requested Lucide name doesn't resolve, the category's
// representative icon is used, and `circle-dot` when there is no category. Copied from OpenUI's `categoryFallbacks`.

/** Semantic icon-category → representative lucide icon name (kebab-case). */
export const categoryFallbacks: Readonly<Record<string, string>> = {
  accessibility: 'accessibility',
  account: 'user',
  animals: 'cat',
  arrows: 'arrow-right',
  brands: 'box',
  buildings: 'building',
  charts: 'chart-line',
  communication: 'message-square',
  connectivity: 'wifi',
  cursors: 'mouse-pointer',
  design: 'palette',
  development: 'code',
  devices: 'smartphone',
  emoji: 'smile',
  files: 'file',
  finance: 'dollar-sign',
  'food-beverage': 'cooking-pot',
  gaming: 'gamepad',
  home: 'house',
  layout: 'layout',
  mail: 'mail',
  math: 'calculator',
  medical: 'heart-pulse',
  multimedia: 'music',
  nature: 'tree-pine',
  navigation: 'map-pin',
  notifications: 'bell',
  people: 'users',
  photography: 'camera',
  science: 'microscope',
  seasons: 'sun',
  security: 'shield',
  shapes: 'circle',
  shopping: 'shopping-cart',
  social: 'share-2',
  sports: 'trophy',
  sustainability: 'leaf',
  text: 'type',
  time: 'clock',
  tools: 'wrench',
  transportation: 'car',
  travel: 'plane',
  weather: 'cloud',
};

/** Rendered when neither the icon name nor its category resolves. */
export const defaultFallbackIconName = 'circle-dot';

/** The icon name to load when a requested icon name misses the catalog. */
export function fallbackIconName(category: string | undefined): string {
  const name = categoryFallbacks[category?.trim().toLowerCase() ?? ''];
  return name === undefined ? defaultFallbackIconName : name;
}

/** The Lucide name to draw for an `Icon`: its own name, or the fallback its category chooses. */
export function resolvedIconName(name: string, category: string | undefined): string {
  if (iconNames.has(name)) return name;
  const fallback = fallbackIconName(category);
  return iconNames.has(fallback) ? fallback : defaultFallbackIconName;
}
