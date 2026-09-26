import { manifestSchema } from '@kvman/protocol';
import { stageSummary } from '../../src/index.ts';
import { describe, expect, it } from 'vitest';
import pdf from '../../../protocol/test/fixtures/pdf-manifest.json' with { type: 'json' };

// The pdf fixture (M0.3) with every UI kind it lacks, a calls request, an isolation request, a subscription, and a
// provider: the SDK registers UI and providers only from M2.9 and M2.10, so the manifest is written as JSON.
const manifest = manifestSchema.parse({
  ...pdf,
  permissions: {
    ...pdf.permissions,
    capabilities: [...pdf.permissions.capabilities, { name: 'calls', reason: 'Asks the agent to translate.', types: ['agent.*'] }],
    isolation: { mode: 'dedicated', reason: 'Runs a heavy converter.' },
  },
  subscriptions: [{ event: 'kernel.extension.installed', description: 'Notices installs.', handler: 'subscription:kernel.extension.installed' }],
  llm: { providers: [{ id: 'pdf-local', title: 'Local', description: 'A local model.', auth: 'none', functions: ['provider:pdf-local.complete', 'provider:pdf-local.status'] }], models: [] },
  ui: {
    ...pdf.ui,
    slots: [{ id: 'pdf.sidebar', description: 'Beside a file.', accepts: ['panel', 'toolbarItem'] }],
    panels: [{ id: 'pdf.details', description: 'File details.', slot: 'pdf.sidebar', view: { type: 'markdown', source: 'Details.' } }],
    toolbarItems: [{ id: 'pdf.refresh', description: 'Refreshes.', slot: 'pdf.sidebar', as: 'button', label: 'Refresh', action: { navigate: '/files' } }],
    rendererTargets: [{ id: 'pdf.page', description: 'One page.', item: { type: 'object' } }],
    settingsSection: { description: 'PDF settings.', view: { type: 'markdown', source: 'Settings.' } },
  },
});

describe('the stage reply (plan 06 §6.2, ADRs 0015, 0118)', () => {
  it('M2.2-E31 capabilities, isolation, types, contributions with their kinds, warnings, and translations', () => {
    const warning = { path: 'types.0.type', message: 'grammar', severity: 'warning' as const };
    const summary = stageSummary({ tree: '/t', source: 'npm:@acme/pdf@1.2.0', integrity: 'sha512-AAAA', digest: 'd'.repeat(64), manifest, warnings: [warning] });
    expect(summary).toMatchObject({ name: '@acme/pdf', version: '1.2.0', title: '$t.meta.title', summary: '$t.meta.summary', namespace: 'pdf', integrity: 'sha512-AAAA', warnings: [warning] });
    expect(summary.capabilities).toEqual({
      requested: manifest.permissions.capabilities,
      derived: { subscribes: ['kernel.extension.installed'], providesLlm: ['pdf-local'] },
    });
    expect(summary.isolation).toEqual({ mode: 'dedicated', reason: 'Runs a heavy converter.' });
    expect(summary.types).toContainEqual({ type: 'pdf.translate', kind: 'command', access: 'all', agentTool: true });
    expect(summary.types).toContainEqual({ type: 'pdf.imported', kind: 'event', agentTool: false });
    expect(summary.contributions).toEqual(expect.arrayContaining([
      { id: 'pdf.files', kind: 'page' }, { id: 'pdf.queue', kind: 'statusItem' }, { id: 'pdf.refresh', kind: 'toolbarItem', slot: 'pdf.sidebar' },
      { id: 'pdf.details', kind: 'panel', slot: 'pdf.sidebar' }, { id: 'pdf.sidebar', kind: 'slot' }, { id: 'pdf.translate', kind: 'action', target: 'pdf.file' },
      { id: 'pdf.page', kind: 'rendererTarget' }, { id: 'pdf.preview', kind: 'renderer', target: 'mime:application/pdf' }, { id: 'pdf.settings', kind: 'settingsSection' },
    ]));
    expect(new Set(summary.contributions.map((contribution) => contribution.kind))).toEqual(new Set([
      'page', 'navGroup', 'navItem', 'toolbarItem', 'statusItem', 'panel', 'slot', 'action', 'rendererTarget', 'renderer', 'component', 'settingsSection',
    ]));
    expect(Object.keys(summary.translations).sort()).toEqual(['ar', 'en']);
    expect(summary.translations['en']).toMatchObject({ title: expect.any(String), summary: expect.any(String), reasons: { llm: expect.any(String), ui: expect.any(String) } });
    expect(summary.translations['en']?.reasons).not.toHaveProperty('calls');
  });
});
