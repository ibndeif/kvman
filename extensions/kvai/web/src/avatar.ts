// The provider avatar's colour (plan 07 §7.3, ADR 0009, 243): the palette order is exact, chosen by the sum of
// the provider id's character codes, modulo 8.
export const avatarPalette = ['#a8472a', '#10624a', '#2b2f6b', '#4b3a8c', '#1a56a8', '#8a2f5a', '#1f5f7a', '#5a4a2a'] as const;

export type Avatar = { letter: string; color: string };

/** The avatar of a provider: its title's first letter, upper-cased, on its palette colour. */
export function avatarOf(providerId: string, title: string): Avatar {
  const first = Array.from(title)[0];
  const letter = first === undefined ? '?' : first.toLocaleUpperCase();
  let sum = 0;
  for (let index = 0; index < providerId.length; index += 1) sum += providerId.charCodeAt(index) ?? 0;
  const color = avatarPalette[sum % avatarPalette.length] ?? avatarPalette[0];
  return { letter, color: String(color) };
}
