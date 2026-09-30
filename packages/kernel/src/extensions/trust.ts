import type { Clock } from '../clock.ts';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/database.ts';
import type { ReadExtension } from './manifests.ts';

// Trust (plan 02 §2.9, ADR 0009, 48): a non-bundled version loads only once it's accepted. Accepted versions are
// remembered in SQLite; a `path:` one by its absolute folder, so the same relative path from another preset asks again.

export type ExtensionVersion = { name: string; version: string; source: string };

// Decides on the versions not accepted before: true accepts them all.
export type TrustDecision = (versions: readonly ExtensionVersion[]) => Promise<boolean>;

function versionOf(extension: ReadExtension): ExtensionVersion | undefined {
  if (extension.source === 'bundled') return undefined;
  const source = extension.source.startsWith('path:') ? `path:${extension.folder}` : extension.source;
  return { name: extension.name, version: extension.manifest.version, source };
}

function isAccepted(connection: Connection, version: ExtensionVersion): boolean {
  const row = connection.prepare<[string, string, string], { name: string }>('SELECT name FROM accepted_extensions WHERE name = ? AND version = ? AND source = ?');
  return row.get(version.name, version.version, version.source) !== undefined;
}

export async function checkTrust(connection: Connection, clock: Clock, extensions: readonly ReadExtension[], decide: TrustDecision): Promise<void> {
  const unaccepted = extensions.flatMap((extension) => versionOf(extension) ?? []).filter((version) => !isAccepted(connection, version));
  if (unaccepted.length === 0) return;
  if (!(await decide(unaccepted))) {
    const listed = unaccepted.map((version) => `${version.name}@${version.version} (${version.source})`);
    throw kernelProblem('EXTENSION_INVALID', `These extension versions weren't accepted: ${listed.join(', ')}.`, { versions: listed });
  }
  const acceptedAt = new Date(clock.now()).toISOString();
  const insert = connection.prepare('INSERT INTO accepted_extensions (name, version, source, accepted_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING');
  connection.transaction(() => {
    for (const version of unaccepted) insert.run(version.name, version.version, version.source, acceptedAt);
  })();
}
