import {
  extensionGetRequestSchema, extensionsListRequestSchema, jsonSchema, manifestSchema, quarantineReasonSchema, type Capabilities, type ExtensionGetResult, type ExtensionListing,
  type Isolation, type Issue, type Json, type Manifest,
} from '@kvman/protocol';
import type { RegistryState } from '../registry/registry-state.ts';
import type { GrantsSource } from '../router/grants.ts';
import type { Connection } from '../storage/driver.ts';
import { readWorkspace } from './workspace-rows.ts';

export type ExtensionQueryAnswer<T> =
  | { ok: true; value: T }
  | {
    ok: false;
    code: 'NOT_FOUND' | 'WORKSPACE_INVALID' | 'CAPABILITY_DENIED' | 'PRESET_REQUIRED' | 'PRESET_INVALID' | 'PRESET_UNSHAREABLE' | 'PRESET_SECRET' | 'PRESET_READONLY';
    detail: string;
    issues?: Issue[];
  };

type ExtensionRow = { name: string; digest: string; status: string; reason: unknown; pending: boolean };

// kernel.extensions.list and kernel.extension.get (03 §3.8, ADR 0119): installed state from the database, enabled
// workspaces and grants from the applied presets (ADR 0123).
export class ExtensionQueries {
  readonly #connection: Connection;
  readonly #registry: RegistryState;
  readonly #grants: GrantsSource;

  constructor(connection: Connection, registry: RegistryState, grants: GrantsSource) {
    this.#connection = connection;
    this.#registry = registry;
    this.#grants = grants;
  }

  list(payload: unknown): ExtensionQueryAnswer<ExtensionListing[]> {
    const { workspaceId } = extensionsListRequestSchema.parse(payload);
    if (workspaceId !== undefined && readWorkspace(this.#connection, workspaceId) === undefined) {
      return { ok: false, code: 'WORKSPACE_INVALID', detail: `no workspace ${workspaceId} exists` };
    }
    const listings = this.#rows().map((row) => this.#listing(row));
    return { ok: true, value: workspaceId === undefined ? listings : listings.filter((listing) => listing.enabledIn.includes(workspaceId)) };
  }

  get(payload: unknown): ExtensionQueryAnswer<Json> {
    const { name } = extensionGetRequestSchema.parse(payload);
    const manifest = this.#registry.current().manifestOf(name);
    if (manifest === undefined) return { ok: false, code: 'NOT_FOUND', detail: `no extension ${name} is installed` };
    const versions = this.#connection
      .prepare('SELECT digest, source, manifest, installed_at FROM extension_versions WHERE name = ? ORDER BY installed_at DESC, digest')
      .all(name)
      .map((row) => ({ digest: String(row['digest']), source: String(row['source']), version: this.#versionOf(String(row['manifest'])), installedAt: Number(row['installed_at']) }));
    const grants = Object.fromEntries(this.#enabledIn(name).flatMap((workspaceId): Array<[string, Capabilities]> => {
      const granted = this.#grants.capabilities(name, workspaceId);
      return granted === undefined ? [] : [[workspaceId, granted]];
    }));
    const result: ExtensionGetResult = { versions, manifest, grants };
    return { ok: true, value: jsonSchema.parse(result) };
  }

  #rows(): ExtensionRow[] {
    return this.#connection
      .prepare('SELECT name, active_digest, status, quarantine_reason, pending_digest FROM extensions WHERE active_digest IS NOT NULL ORDER BY name')
      .all()
      .map((row) => ({ name: String(row['name']), digest: String(row['active_digest']), status: String(row['status']), reason: row['quarantine_reason'], pending: row['pending_digest'] !== null }));
  }

  #versionOf(manifestText: string): string {
    return manifestSchema.parse(JSON.parse(manifestText)).meta.version;
  }

  #enabledIn(name: string): string[] {
    return [...this.#registry.enabled()].filter(([, names]) => names.includes(name)).map(([workspaceId]) => workspaceId).sort();
  }

  #listing(row: ExtensionRow): ExtensionListing {
    const manifest: Manifest | undefined = this.#registry.current().manifestOf(row.name);
    if (manifest === undefined) throw new Error(`the registry has no manifest for ${row.name}`);
    const { meta } = manifest;
    const enabledIn = this.#enabledIn(row.name);
    const isolation = Object.fromEntries(enabledIn.flatMap((workspaceId): Array<[string, Isolation]> => {
      const granted = this.#grants.capabilities(row.name, workspaceId);
      return granted === undefined ? [] : [[workspaceId, granted.isolation]];
    }));
    const reason = quarantineReasonSchema.safeParse(row.reason);
    const quarantined = row.status === 'quarantined';
    return {
      name: meta.name, title: meta.title, ...(meta.icon === undefined ? {} : { icon: meta.icon }), description: meta.description, version: meta.version,
      namespace: meta.namespace, activeDigest: row.digest, status: quarantined ? 'quarantined' : row.pending ? 'needs-approval' : 'active',
      ...(quarantined && reason.success ? { quarantineReason: reason.data } : {}), isolation, enabledIn,
    };
  }
}
