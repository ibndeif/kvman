import { z } from '@kvman/sdk';
import { isEmbedded } from './embedded.ts';
import type { Kvwebui } from './kvwebui.ts';

// What an embedded page takes from its host (plan 06 §6.2, ADR 0100, 11 to 13, ADR 0101, 5): the theme, the opening of
// the pages menu, text to insert, and a press of the host's New. Only `window.parent` is heard, only while embedded; a
// message of another shape is ignored.

const cssValue = z.string().min(1).max(500);

const themeSchema = z.object({
  kind: z.literal('kvman.theme'),
  dark: z.boolean(),
  colors: z.object({ background: cssValue, surface: cssValue, text: cssValue, muted: cssValue, border: cssValue, primary: cssValue, onPrimary: cssValue, danger: cssValue, warning: cssValue, success: cssValue }),
  fonts: z.object({ sans: cssValue, mono: cssValue, size: cssValue }),
});

const fromHostSchema = z.discriminatedUnion('kind', [themeSchema, z.object({ kind: z.literal('kvman.pages') }), z.object({ kind: z.literal('kvman.insert'), text: z.string().max(1_000_000) }), z.object({ kind: z.literal('kvman.new') })]);

export type HostTheme = z.infer<typeof themeSchema>;

const mix = (color: string, percent: number, base: string): string => `color-mix(in srgb, ${color} ${String(percent)}%, ${base})`;

// kvwebui's variables from the host's colors; the soft and ink shades are mixed from them.
function themeVariables({ colors, fonts }: HostTheme): Record<string, string> {
  const { surface } = colors;
  return {
    '--kvwebui-ground': colors.background,
    '--kvwebui-surface': surface,
    '--kvwebui-sunken': mix(colors.text, 4, surface),
    '--kvwebui-ink': colors.text,
    '--kvwebui-muted': colors.muted,
    '--kvwebui-line': colors.border,
    '--kvwebui-line-soft': mix(colors.border, 60, surface),
    '--kvwebui-primary': colors.primary,
    '--kvwebui-on-primary': colors.onPrimary,
    '--kvwebui-accent-soft': mix(colors.primary, 18, surface),
    '--kvwebui-accent-ink': colors.text,
    '--kvwebui-neutral-soft': mix(colors.muted, 14, surface),
    '--kvwebui-neutral-ink': colors.text,
    '--kvwebui-success-soft': mix(colors.success, 16, surface),
    '--kvwebui-success-ink': colors.success,
    '--kvwebui-warning-soft': mix(colors.warning, 16, surface),
    '--kvwebui-warning-ink': colors.warning,
    '--kvwebui-danger': colors.danger,
    '--kvwebui-danger-soft': mix(colors.danger, 14, surface),
    '--kvwebui-danger-ink': colors.danger,
    '--kvwebui-danger-line': mix(colors.danger, 40, surface),
    '--kvwebui-toast': colors.text,
    '--kvwebui-on-toast': colors.background,
    '--kvwebui-online': colors.success,
    '--kvwebui-font-sans': fonts.sans,
    '--kvwebui-font-mono': fonts.mono,
  };
}

export function applyHostTheme(state: Kvwebui, theme: HostTheme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVariables(theme))) root.style.setProperty(name, value);
  // The host's size is the size of body text, which is 0.875rem (ADR 0106, 1).
  root.style.fontSize = `calc(${theme.fonts.size} * 8 / 7)`;
  root.classList.toggle('dark', theme.dark);
  state.host.theme.value = theme;
}

/** Hears the host while the app runs; returns the undo. */
export function listenToHost(state: Kvwebui): () => void {
  const onMessage = (event: MessageEvent): void => {
    if (!isEmbedded() || event.source !== window.parent) return;
    const message = fromHostSchema.safeParse(event.data).data;
    if (message === undefined) return;
    if (message.kind === 'kvman.theme') applyHostTheme(state, message);
    else if (message.kind === 'kvman.pages') state.host.pagesOpen.value = true;
    else if (message.kind === 'kvman.new') state.host.newOffers.at(-1)?.();
    else for (const handler of [...state.host.inserts]) handler(message.text);
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}
