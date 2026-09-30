import type { Workspace } from '@kvman/sdk';
import { kernelCommand, kernelQuery } from '../api/kernel.ts';
import { homeWorkspaceId, workspaceMemory, type Kvwebui } from './kvwebui.ts';

// The tab's workspace (plan 06 §6.2, ADR 0009, 74): `?workspace=<id>` at load, else what the tab remembers, else Home.
// Every call sends it; switching reruns the page's queries and reloads the settings, which may differ per workspace.

export function startWorkspace(workspaces: readonly Workspace[], fromUrl: string | undefined): string {
  const open = (id: string | null | undefined): id is string => workspaces.some((workspace) => workspace.id === id);
  if (fromUrl !== undefined) return open(fromUrl) ? fromUrl : homeWorkspaceId;
  const remembered = workspaceMemory.read();
  return open(remembered) ? remembered : homeWorkspaceId;
}

export async function reloadSettings(state: Kvwebui): Promise<void> {
  state.settings.value = await kernelQuery(state.api, 'kernel.settings.list', {});
}

export async function reloadWorkspaces(state: Kvwebui): Promise<void> {
  state.workspaces.value = await kernelQuery(state.api, 'kernel.workspace.list', {});
}

export async function switchWorkspace(state: Kvwebui, id: string): Promise<void> {
  state.workspace.value = id;
  workspaceMemory.write(id);
  await reloadSettings(state);
  state.revision.value += 1;
}

export async function openFolder(state: Kvwebui, path: string): Promise<void> {
  const workspace = await kernelCommand(state.api, 'kernel.workspace.open', { path });
  await reloadWorkspaces(state);
  await switchWorkspace(state, workspace.id);
}

export async function closeWorkspace(state: Kvwebui, id: string): Promise<void> {
  await kernelCommand(state.api, 'kernel.workspace.close', { workspaceId: id });
  if (state.workspace.value === id) await switchWorkspace(state, homeWorkspaceId);
  await reloadWorkspaces(state);
}

// A tab whose workspace was closed elsewhere moves to Home, and says so.
export async function moveHome(state: Kvwebui, goneId: string): Promise<void> {
  const name = state.workspaces.value.find((workspace) => workspace.id === goneId)?.name ?? goneId;
  await switchWorkspace(state, homeWorkspaceId);
  await reloadWorkspaces(state);
  state.toasts.show({ text: 'kvwebui.workspace.movedHome', params: { name }, level: 'warning' });
}
