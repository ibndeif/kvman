import { panelMemory, type Kvwebui } from './kvwebui.ts';

// Panels (plan 06 §6.2): one open at a time, remembered for the tab. A `panel` effect or `kvman.panel` naming a panel
// that isn't loaded does nothing (ADR 0009, 83).

export function setPanel(state: Kvwebui, id: string | null): void {
  state.panel.value = id;
  panelMemory.write(id);
}

export function openPanel(state: Kvwebui, id: string, open: boolean): void {
  if (!state.registry.value.panels.some((panel) => panel.id === id)) return;
  if (open) setPanel(state, id);
  else if (state.panel.value === id) setPanel(state, null);
}
