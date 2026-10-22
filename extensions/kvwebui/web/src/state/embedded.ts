import type { Kvman } from '@kvman/sdk/web';

// kvwebui embedded in a host (plan 06 §6.2, ADR 0100, 9 to 11): a page opened with `?embed=parent` runs in a host's
// frame, such as the VS Code view. It has no frame of its own, hands new windows to the host, and tells the host what
// to open. The tab keeps the mode in `sessionStorage`; the framing policy (plan 04 §4.2) decides which parents can hold
// the page at all.

const embedKey = 'kvwebui.embed';
const embedValue = 'parent';

export type HostMessage =
  | { kind: 'kvman.state'; workspaceId: string }
  | { kind: 'kvman.open'; url: string }
  | { kind: 'kvman.openFile'; path: string; line?: number }
  | { kind: 'kvman.openDiff'; title: string; path: string; after: string }
  | { kind: 'kvman.openChange'; path: string };

/** Keeps `?embed=parent` for the tab; says whether the parameter was taken, so the caller removes it from the URL. */
export function takeEmbed(value: unknown): boolean {
  if (value !== embedValue) return false;
  sessionStorage.setItem(embedKey, embedValue);
  return true;
}

export function isEmbedded(): boolean {
  return sessionStorage.getItem(embedKey) === embedValue;
}

export function postToHost(message: HostMessage): void {
  if (isEmbedded()) window.parent.postMessage(message, '*');
}

export const openWindow: Kvman['open'] = (url) => {
  if (isEmbedded()) {
    postToHost({ kind: 'kvman.open', url });
    return 'opened';
  }
  const tab = window.open(url, '_blank');
  if (tab === null) return 'blocked';
  tab.opener = null;
  return 'opened';
};

function webAddress(anchor: HTMLAnchorElement): string | undefined {
  if (!URL.canParse(anchor.href)) return undefined;
  const address = new URL(anchor.href);
  return address.protocol === 'http:' || address.protocol === 'https:' ? address.href : undefined;
}

function newWindowLink(event: MouseEvent): string | undefined {
  if (!(event.target instanceof Element)) return undefined;
  const anchor = event.target.closest('a');
  if (anchor === null || anchor.target !== '_blank') return undefined;
  return webAddress(anchor);
}

/** Catches clicks and middle clicks on `target="_blank"` web links while embedded; returns the undo. */
export function catchNewWindowLinks(page: Document): () => void {
  const onClick = (event: MouseEvent): void => {
    if (!isEmbedded() || (event.type === 'auxclick' && event.button !== 1)) return;
    const url = newWindowLink(event);
    if (url === undefined) return;
    event.preventDefault();
    postToHost({ kind: 'kvman.open', url });
  };
  page.addEventListener('click', onClick, true);
  page.addEventListener('auxclick', onClick, true);
  return () => {
    page.removeEventListener('click', onClick, true);
    page.removeEventListener('auxclick', onClick, true);
  };
}

/** The injected object's `host` (plan 06 §6.4): the opens post while embedded, and inserted text reaches the handlers. */
export function hostCalls(inserts: Set<(text: string) => void>): Kvman['host'] {
  return {
    get embedded() {
      return isEmbedded();
    },
    openFile: (path, line) => postToHost(line === undefined ? { kind: 'kvman.openFile', path } : { kind: 'kvman.openFile', path, line }),
    openDiff: (title, path, after) => postToHost({ kind: 'kvman.openDiff', title, path, after }),
    openChange: (path) => postToHost({ kind: 'kvman.openChange', path }),
    onInsert: (handler) => {
      inserts.add(handler);
      return () => void inserts.delete(handler);
    },
  };
}
