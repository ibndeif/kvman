import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileSchema, type File } from '@kvman/sdk';
import { isoTime, type Clock } from '../clock.ts';
import type { IdGenerator } from '../ids.ts';
import { fileLimitBytes } from '../limits.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import { validationFailed } from '../store/json-values.ts';

// Files the kernel keeps (plan 02 §2.7): the content at `files/<id>` in the home, and a row.

export type FileOwner = File['owner'];

export type NewFile = { name: string; data: Uint8Array | string; type: string; owner: FileOwner; workspaceId: string };

export type Files = {
  write(file: NewFile): File;
  get(id: string): File;
  list(workspaceId: string, limit: number): File[];
  read(id: string): Buffer;
  path(id: string): string;
  unlink(id: string): void;
};

type FileRow = { id: string; name: string; type: string; size: number; owner: string; workspace_id: string; created_at: string };

export type FilesOptions = { connection: Connection; home: string; ids: IdGenerator; clock: Clock };

function sizeOf(data: Uint8Array | string): number {
  return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
}

export function createFiles({ connection, home, ids, clock }: FilesOptions): Files {
  const folder = path.join(home, 'files');
  const contentPath = (id: string): string => path.join(folder, id);
  const fileOfRow = (row: FileRow): File => {
    const owner: unknown = JSON.parse(row.owner);
    return fileSchema.parse({ id: row.id, name: row.name, type: row.type, size: row.size, owner, workspaceId: row.workspace_id, createdAt: row.created_at });
  };
  const get = (id: string): File => {
    const row = connection.prepare<[string], FileRow>('SELECT * FROM files WHERE id = ?').get(id);
    if (row === undefined) throw kernelProblem('NOT_FOUND', `There is no file ${id}.`, { id });
    return fileOfRow(row);
  };
  return {
    write({ name, data, type, owner, workspaceId }) {
      const size = sizeOf(data);
      if (size > fileLimitBytes) throw kernelProblem('TOO_LARGE', `A file is over the limit of ${fileLimitBytes} bytes.`, { limit: fileLimitBytes });
      const parsed = fileSchema.safeParse({ id: ids(), name, type, size, owner, workspaceId, createdAt: isoTime(clock) });
      if (!parsed.success) throw validationFailed('The file', parsed.error);
      const file = parsed.data;
      mkdirSync(folder, { recursive: true });
      writeFileSync(contentPath(file.id), data, { flag: 'wx' });
      try {
        connection
          .prepare('INSERT INTO files (id, name, type, size, owner, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(file.id, file.name, file.type, file.size, JSON.stringify(file.owner), file.workspaceId, file.createdAt);
      } catch (error) {
        rmSync(contentPath(file.id), { force: true });
        throw error;
      }
      return file;
    },
    get,
    list: (workspaceId, limit) =>
      connection.prepare<[string, number], FileRow>('SELECT * FROM files WHERE workspace_id = ? ORDER BY id DESC LIMIT ?').all(workspaceId, limit).map(fileOfRow),
    read: (id) => readFileSync(contentPath(get(id).id)),
    path: (id) => contentPath(get(id).id),
    unlink(id) {
      get(id);
      connection.prepare('DELETE FROM files WHERE id = ?').run(id);
      rmSync(contentPath(id), { force: true });
    },
  };
}
