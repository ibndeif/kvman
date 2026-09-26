import type { FileEntry, FileStat } from '@kvman/protocol';

/** An entry of `ctx.files.list`, and what `ctx.files.stat` answers. */
export type { FileEntry, FileStat };

/** `ctx.files` (07 §7.2): the workspace's files, jailed to its folder, with `.kvman/` behind the trust gate. */
export interface WorkspaceFiles {
  /** A file's UTF-8 text, up to 16 MB; the path is relative to the workspace root. */
  read(path: string): Promise<string>;
  /** Creates or replaces a file, and its missing parent folders, up to 16 MB. */
  write(path: string, content: string | Uint8Array): Promise<void>;
  /** A folder's entries sorted by name; the workspace root without a path. */
  list(path?: string): Promise<FileEntry[]>;
  /** A path's kind, size, and modification time, or `undefined` when it does not exist. */
  stat(path: string): Promise<FileStat | undefined>;
  /** Creates a folder and its parents; no error if it exists. */
  mkdir(path: string): Promise<void>;
  /** Removes a file, or a folder with `recursive`; no error if it is missing. */
  rm(path: string, options?: { recursive?: boolean }): Promise<void>;
  /** The relative paths matching a Node `fs.glob` pattern, sorted, up to 5,000. */
  glob(pattern: string): Promise<string[]>;
}
