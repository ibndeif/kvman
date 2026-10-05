import type { View } from './views.ts';

// kvwebui's own configuration (ADR 0014, 12): it is the host and has no `ui.get`, so its view is built in.

const card = (title: string, keys: readonly string[]): View => ({ type: 'card', title, children: keys.map((key) => ({ type: 'setting', key })) });

export const ownConfiguration: View = {
  type: 'stack',
  direction: 'vertical',
  children: [
    card('kvwebui.config.appearance', ['kvwebui.theme']),
    card('kvwebui.config.navigation', ['kvwebui.nav.order', 'kvwebui.nav.hidden']),
    card('kvwebui.config.app', ['kvwebui.title', 'kvwebui.home']),
  ],
};
