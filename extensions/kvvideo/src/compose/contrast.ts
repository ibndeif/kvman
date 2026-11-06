// Text on a coloured ground (plan 16 §16.8): white or near black, whichever contrasts more, by the grounds' relative
// luminance, for a callout's label and a branded caption's box.

const luminance = (colour: string): number => {
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const value = Number.parseInt(colour.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
};

/** White or near black, whichever contrasts more with `background`. */
export function textOn(background: string): string {
  const light = luminance(background);
  return 1.05 / (light + 0.05) >= (light + 0.05) / (luminance('#111111') + 0.05) ? '#ffffff' : '#111111';
}
