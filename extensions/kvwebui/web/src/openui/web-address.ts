// The web addresses OpenUI may open (plan 06 §6.1, ADR 0124, 3, 14): only `http` and `https`.

/** Whether a URL is an `http` or `https` address. */
export function isWebAddress(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const protocol = new URL(url).protocol;
  return protocol === 'http:' || protocol === 'https:';
}
