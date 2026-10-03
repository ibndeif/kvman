// The fixed quick-connect tiles (plan 07 §7.3, ADR 0009, 241): tile names and notes are translation keys.
export type FeaturedTile = { provider: string; name: string; note?: string };

/** Large tiles for signing in with a plan the person already pays for. */
export const planTiles: FeaturedTile[] = [
  { provider: 'anthropic', name: 'kvai.ui.providers.tile.claude', note: 'kvai.ui.providers.tile.claudePlan' },
  { provider: 'openai', name: 'kvai.ui.providers.tile.chatgpt', note: 'kvai.ui.providers.tile.chatgptPlan' },
  { provider: 'github-copilot', name: 'kvai.ui.providers.tile.copilot', note: 'kvai.ui.providers.tile.copilotPlan' },
];

/** Compact tiles for adding an API key. */
export const keyTiles: FeaturedTile[] = [
  { provider: 'anthropic', name: 'kvai.ui.providers.tile.anthropic' },
  { provider: 'google', name: 'kvai.ui.providers.tile.google' },
  { provider: 'xai', name: 'kvai.ui.providers.tile.xai' },
];
