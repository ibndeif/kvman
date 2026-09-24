import type { Text } from '@kvman/protocol';
import type { Ext } from './ext.ts';

/** Who the extension is, for people and for developers. */
export type ExtensionMeta = {
  name: string;
  namespace: string;
  title: Text;
  summary?: Text;
  description: string;
  icon?: string;
  implements?: string[];
};

/** What `defineExtension` returns: the extension's default export. */
export type ExtensionDefinition = { readonly meta: ExtensionMeta; readonly setup: (ext: Ext) => void };

/** Defines an extension; `setup` only registers, synchronously and deterministically. */
export function defineExtension(meta: ExtensionMeta, setup: (ext: Ext) => void): ExtensionDefinition {
  return Object.freeze({ meta, setup });
}
