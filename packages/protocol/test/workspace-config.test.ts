import { describe, expect, it } from 'vitest';
import {
  configChangedSchema, configGetRequestSchema, configGetResultSchema, configSetRequestSchema, extensionDisableRequestSchema, extensionEnabledSchema,
  extensionEnableRequestSchema, extensionUnquarantinedSchema, presetRevisionResultSchema, secretClearRequestSchema, secretSetRequestSchema, workspaceEventSchema,
  workspaceForgetRequestSchema, workspaceGetResultSchema, workspaceOpenRequestSchema, workspaceOpenResultSchema, workspaceRenameRequestSchema,
  workspacesListRequestSchema, workspacesListResultSchema,
} from '../src/index.ts';

const workspaceId = 'a'.repeat(64);
const grants = { isolation: 'sandboxed', requested: [{ name: 'calls', types: ['pdf.*'] }], derived: { subscribes: [], providesLlm: [] } };

describe('workspace, enable, config, and secret shapes (plan 03 §3.8, ADRs 0122–0127)', () => {
  it('M2.3-E52 the plan shapes parse; unknown keys, long names, and bad secret names are refused', () => {
    const valid: Array<[{ safeParse(value: unknown): { success: boolean } }, unknown]> = [
      [workspaceOpenRequestSchema, { path: '/home/me/research' }], [workspaceOpenResultSchema, { workspaceId }],
      [workspaceRenameRequestSchema, { workspaceId, name: 'Research' }], [workspaceForgetRequestSchema, { workspaceId }],
      [workspacesListRequestSchema, { includePreview: true }],
      [workspacesListResultSchema, [{ id: workspaceId, path: '/w/a', name: 'A', kind: 'normal', trusted: false, exists: true }]],
      [workspaceGetResultSchema, { id: workspaceId, path: '/w/a', name: 'A', kind: 'normal', trust: null, repoPreset: false }], [workspaceEventSchema, { workspaceId }],
      [extensionEnableRequestSchema, { workspaceId, name: '@acme/pdf', grants }], [extensionDisableRequestSchema, { workspaceId, name: '@acme/pdf' }],
      [presetRevisionResultSchema, { revision: 2 }], [extensionEnabledSchema, { workspaceId, name: '@acme/pdf' }], [extensionUnquarantinedSchema, { name: '@acme/pdf' }],
      [configGetRequestSchema, { extension: '@acme/pdf', workspaceId }],
      [configGetResultSchema, { global: { value: {}, revision: 0 }, workspace: null, merged: { depth: 1 } }],
      [configSetRequestSchema, { extension: '@acme/pdf', scope: 'workspace', workspaceId, value: { depth: 2 }, revision: 0 }],
      [configChangedSchema, { extension: '@acme/pdf', scope: 'global', revision: 1 }],
      [secretSetRequestSchema, { extension: '@acme/pdf', name: 'auth.token', value: 'sk-1' }], [secretClearRequestSchema, { extension: '@acme/pdf', name: 'apiKey' }],
    ];
    for (const [schema, value] of valid) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(true);
    const invalid: Array<[{ safeParse(value: unknown): { success: boolean } }, unknown]> = [
      [workspaceOpenRequestSchema, { path: '/w', name: 'x' }], [workspaceRenameRequestSchema, { workspaceId, name: 'x'.repeat(101) }],
      [workspaceRenameRequestSchema, { workspaceId, name: '   ' }], [extensionEnableRequestSchema, { workspaceId, name: '@acme/pdf', grants, extra: 1 }],
      [configSetRequestSchema, { extension: '@acme/pdf', scope: 'both', value: {}, revision: 0 }],
      [secretSetRequestSchema, { extension: '@acme/pdf', name: 'bad name', value: 'x' }], [secretSetRequestSchema, { extension: '@acme/pdf', name: 'apiKey', value: '' }],
      [secretClearRequestSchema, { extension: '@acme/pdf', name: 'x'.repeat(129) }],
    ];
    for (const [schema, value] of invalid) expect(schema.safeParse(value).success, JSON.stringify(value)).toBe(false);
  });
});
