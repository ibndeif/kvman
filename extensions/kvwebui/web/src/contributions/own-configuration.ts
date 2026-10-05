import type { View } from './views.ts';

// kvwebui's own configuration (ADR 0015, 6): it is the host and has no `ui.get`, so its view is built in.

export const ownConfiguration: View = { type: 'card', title: 'kvwebui.config.appearance', children: [{ type: 'setting', key: 'kvwebui.theme' }] };
