import type { Json } from '@kvman/sdk';
import type { Kvman } from '@kvman/sdk/web';

// What the Chat page's new chat reads from the settings (plan 08 §8.7, ADR 0082, 6, 7, and 11): the approval mode for
// its one line, whether that line is hidden with the Extensions page, and the profile's heading and placeholder.

export type ApprovalMode = 'ask' | 'auto' | 'never';

export type StartSettings = { approval: ApprovalMode | undefined; approvalHidden: boolean; startHeading: string; placeholder: string };

type SettingRow = { key: string; value?: Json };

const field = (value: Json | undefined, name: string): Json | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value[name] : undefined);
const text = (value: Json | undefined, fallback: string): string => (typeof value === 'string' && value !== '' ? value : fallback);

/** The start screen's settings from `kernel.settings.list`, with kvcoder's own words where the profile has none. */
export function startSettingsOf(rows: readonly SettingRow[]): StartSettings {
  const value = (key: string): Json | undefined => rows.find((row) => row.key === key)?.value;
  const approval = value('kvcoder.approval');
  const hidden = value('kvwebui.nav.hidden');
  const profile = value('kvcoder.profile');
  return {
    approval: approval === 'ask' || approval === 'auto' || approval === 'never' ? approval : undefined,
    approvalHidden: Array.isArray(hidden) && hidden.includes('kvwebui.extensions'),
    startHeading: text(field(profile, 'startHeading'), 'kvcoder.ui.startHeading'),
    placeholder: text(field(profile, 'placeholder'), 'kvcoder.ui.startPlaceholder'),
  };
}

/** The tab's workspace as the person knows it: Home is "Home", any other is its name (ADR 0082, 7). */
export function workspaceTitle(kvman: Pick<Kvman, 't' | 'workspace'>): string {
  return kvman.workspace.value.id === 'home' ? kvman.t('kvcoder.ui.homeWorkspace') : kvman.workspace.value.name;
}
