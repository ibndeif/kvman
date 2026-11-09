import type { Token } from 'markdown-it';
import type { InjectionKey } from 'vue';

// Fenced `openui` blocks (plan 06 §6.1, ADR 0124): a block is drawn until its closing fence arrives. While it is the
// last block and its closing fence has not arrived, the block is still streaming. A Markdown view drawn inside an OpenUI
// component treats an `openui` fence as ordinary code, so a nested fence never draws another renderer.

/** Whether a Markdown view is inside an OpenUI component. */
export const insideOpenuiKey: InjectionKey<boolean> = Symbol('kvwebui-inside-openui');

function fenceMarker(token: Token): string {
  return token.markup.charAt(0);
}

function closingFence(marker: string): RegExp {
  return new RegExp(`^ {0,3}${marker}{3,}[ \\t]*$`);
}

/** Whether the fenced block is the last block and its closing fence has not arrived. */
export function openFenceAtEnd(text: string, token: Token): boolean {
  const lines = text.split('\n');
  const start = token.map?.[0];
  const end = token.map?.[1];
  const marker = fenceMarker(token);
  if (start === undefined || end === undefined || marker === '') return false;
  if (lines.slice(end).some((line) => line.trim() !== '')) return false;
  return !lines.slice(start + 1).some((line) => closingFence(marker).test(line));
}
