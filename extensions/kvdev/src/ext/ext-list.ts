import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readProjectManifest, workspaceRelative } from '../folders.ts';

// `ext list` (plan 09 §9.1, ADR 0009, 126): the projects in the workspace folder, itself included, skipping
// `node_modules` and dot-folders, and not looking inside a project it found; sorted by folder.

export type ProjectRow = { folder: string; name: string; namespace: string; version: string };

function walk(workspaceFolder: string, folder: string, rows: ProjectRow[]): void {
  const manifest = readProjectManifest(folder);
  if (manifest !== undefined) {
    rows.push({ folder: workspaceRelative(workspaceFolder, folder), name: manifest.name, namespace: manifest.namespace, version: manifest.version });
    return;
  }
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(workspaceFolder, path.join(folder, entry.name), rows);
  }
}

export function listProjects(workspaceFolder: string): ProjectRow[] {
  const rows: ProjectRow[] = [];
  walk(workspaceFolder, workspaceFolder, rows);
  return rows.sort((a, b) => a.folder.localeCompare(b.folder));
}
