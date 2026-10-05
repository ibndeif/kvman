import type { ExtensionInfo } from '../api/kernel.ts';
import type { Kvwebui } from './kvwebui.ts';
import type { Translator } from './setting-text.ts';

// What the UI calls an extension (ADR 0014, 4): `<namespace>.title`, else the namespace.

export const extensionPath = (namespace: string): string => `/kvwebui/extension/${encodeURIComponent(namespace)}`;

export function extensionTitle({ t, te }: Translator, extension: ExtensionInfo): string {
  return te(`${extension.namespace}.title`) ? t(`${extension.namespace}.title`) : extension.namespace;
}

/** The loaded extension whose page a path shows, if it is an extension's page. */
export function pathExtension(state: Kvwebui, path: string): ExtensionInfo | undefined {
  const namespace = /^\/kvwebui\/extension\/([^/]+)$/.exec(path)?.[1];
  return namespace === undefined ? undefined : state.extensions.value.find((extension) => extension.namespace === decodeURIComponent(namespace));
}

/** The name of the tab's workspace, as the scope switch and the setting rows say it. */
export function workspaceName(state: Kvwebui): string {
  return state.workspaces.value.find((workspace) => workspace.id === state.workspace.value)?.name ?? state.workspace.value;
}
