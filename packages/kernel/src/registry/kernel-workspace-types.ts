import {
  configChangedSchema, configGetRequestSchema, configGetResultSchema, configSetRequestSchema, configSetResultSchema, extensionDisableRequestSchema,
  extensionEnabledSchema, extensionEnableRequestSchema, extensionUnquarantinedSchema, presetRevisionResultSchema, secretChangeResultSchema,
  secretClearRequestSchema, secretSetRequestSchema, workspaceChangeResultSchema, workspaceEventSchema, workspaceForgetRequestSchema,
  workspaceGetRequestSchema, workspaceGetResultSchema, workspaceOpenRequestSchema, workspaceOpenResultSchema, workspaceRenameRequestSchema,
  workspacesListRequestSchema, workspacesListResultSchema, messagesListRequestSchema, messagesListResultSchema, subscribersListRequestSchema,
  subscribersListResultSchema, trustChangedSchema, trustChangeResultSchema, trustGrantRequestSchema, trustPreviewRequestSchema, trustPreviewResultSchema,
  trustRevokeRequestSchema, type TypeEntry,
} from '@kvman/protocol';
import { jsonDocument } from './kernel-json-schemas.ts';

type Schema = Parameters<typeof jsonDocument>[0];

function command(type: string, access: 'all' | 'user', description: string, input: Schema, output: Schema): TypeEntry {
  return { type, kind: 'command', access, handler: `command:${type}`, description, input: jsonDocument(input, 'input'), output: jsonDocument(output, 'output') };
}

function query(type: string, description: string, input: Schema, output: Schema): TypeEntry {
  return { type, kind: 'query', access: 'all', handler: `query:${type}`, description, input: jsonDocument(input, 'input'), output: jsonDocument(output, 'output') };
}

function event(type: string, description: string, payload: Schema): TypeEntry {
  return { type, kind: 'event', delivery: 'durable', description, payload: jsonDocument(payload, 'input') };
}

// 03 §3.8, 06 §6.4, 07 §7.1, §7.2, §7.5 (M2.3, M2.5, ADRs 0122–0127, 0137).
export function workspaceEntries(): TypeEntry[] {
  return [
    command('kernel.workspace.open', 'all', 'Opens a folder as a workspace, creating its record if new. Admin only.', workspaceOpenRequestSchema, workspaceOpenResultSchema),
    command('kernel.workspace.rename', 'all', "Changes a workspace's display name. Admin only.", workspaceRenameRequestSchema, workspaceChangeResultSchema),
    command('kernel.workspace.forget', 'user', 'Forgets a workspace: cancels its work and deletes all its data; the folder is never touched.', workspaceForgetRequestSchema, workspaceChangeResultSchema),
    command('kernel.extension.enable', 'user', 'Enables an extension in a workspace with exactly the capabilities it requests; confirmed in the grant dialog.', extensionEnableRequestSchema, presetRevisionResultSchema),
    command('kernel.extension.disable', 'all', 'Disables an extension in a workspace; its data stays. Admin only.', extensionDisableRequestSchema, presetRevisionResultSchema),
    command('kernel.trust.grant', 'user', "Trusts exactly the previewed files under a workspace's .kvman/ folder; confirmed in the grant dialog.", trustGrantRequestSchema, trustChangeResultSchema),
    command('kernel.trust.revoke', 'all', "Stops trusting a workspace's .kvman/ files. Admin only.", trustRevokeRequestSchema, trustChangeResultSchema),
    command('kernel.config.set', 'all', "Writes an extension's global or workspace config at its current revision. Admin only.", configSetRequestSchema, configSetResultSchema),
    command('kernel.secret.set', 'all', 'Sets one of the secret fields an extension declares. Admin only.', secretSetRequestSchema, secretChangeResultSchema),
    command('kernel.secret.clear', 'all', 'Clears one of the secret fields an extension declares. Admin only.', secretClearRequestSchema, secretChangeResultSchema),
    query('kernel.workspaces.list', 'The opened workspaces, sorted by name, each with whether its folder still exists.', workspacesListRequestSchema, workspacesListResultSchema),
    query('kernel.workspace.get', 'One workspace: its path, name, kind, and trust.', workspaceGetRequestSchema, workspaceGetResultSchema),
    query('kernel.trust.preview', "Every file under a workspace's .kvman/ folder with its SHA-256, and a token to trust exactly them.", trustPreviewRequestSchema, trustPreviewResultSchema),
    query('kernel.config.get', "An extension's stored config rows and merged value, with secrets redacted.", configGetRequestSchema, configGetResultSchema),
    query('kernel.messages.list', 'The stored messages matching the filters, newest first, without payloads or results. Admin only.', messagesListRequestSchema, messagesListResultSchema),
    query('kernel.subscribers.list', 'The extensions enabled in a workspace that would receive an event, each with its granted calls there.', subscribersListRequestSchema, subscribersListResultSchema),
    event('kernel.workspace.opened', 'A folder was opened as a workspace.', workspaceEventSchema),
    event('kernel.workspace.renamed', 'A workspace was renamed.', workspaceEventSchema),
    event('kernel.workspace.forgotten', 'A workspace and all its data were forgotten.', workspaceEventSchema),
    event('kernel.extension.enabled', 'An extension was enabled in a workspace, or its grants changed.', extensionEnabledSchema),
    event('kernel.extension.disabled', 'An extension was disabled in a workspace.', extensionEnabledSchema),
    event('kernel.extension.unquarantined', 'A quarantined extension is available again.', extensionUnquarantinedSchema),
    event('kernel.trust.changed', "A workspace's .kvman/ files became trusted, or stopped being trusted.", trustChangedSchema),
    event('kernel.config.changed', "An extension's global or workspace config was written.", configChangedSchema),
  ];
}
