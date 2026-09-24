import { describe, expect, it } from 'vitest';
import { laneTemplateSchema, manifestSchema, type Manifest } from '../src/index.ts';
import { copyOf, expectRoundTrip, issueMessages, issuePaths } from './assertions.ts';
import pdfManifestFixture from './fixtures/pdf-manifest.json' with { type: 'json' };

const pdfManifest = manifestSchema.parse(pdfManifestFixture);

type Mutable = Record<string, unknown>;

function withChange(change: (manifest: Mutable & Manifest) => void): unknown {
  const manifest = copyOf(pdfManifest) as Mutable & Manifest;
  change(manifest);
  return manifest;
}

function typeEntry(manifest: Manifest, type: string): Mutable {
  const entry = manifest.types.find((candidate) => candidate.type === type);
  if (entry === undefined) throw new Error(`the fixture has no ${type}`);
  return entry as Mutable;
}

function pathsOf(change: (manifest: Mutable & Manifest) => void): string[] {
  return issuePaths(manifestSchema, withChange(change));
}

describe('manifest (plan 05 §5.12, ADRs 0013, 0016)', () => {
  it('M0.3-H1 the pdf manifest validates', () => {
    expectRoundTrip(manifestSchema, pdfManifestFixture);
    expect(pdfManifest.types.map((entry) => entry.type)).toContain('pdf.translate');
  });

  it('M0.3-H5 a missing description fails with its path', () => {
    expect(pathsOf((manifest) => delete typeEntry(manifest, 'pdf.translated')['description'])).toEqual(['types.1.description']);
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translated')['description'] = '   '))).toEqual(['types.1.description']);
  });

  it('M0.3-E1 a newer manifestVersion requires a newer kvman', () => {
    expect(issueMessages(manifestSchema, withChange((manifest) => Reflect.set(manifest, 'manifestVersion', 2)))).toEqual(['requires a newer kvman']);
  });

  it('M0.3-E2 handler references name their own registration', () => {
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translate')['handler'] = 'command:pdf.other'))).toEqual(['types.4.handler']);
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translate')['handler'] = 'handler:pdf.translate'))).toEqual(['types.4.handler']);
    const accepted = withChange((manifest) => {
      manifest.subscriptions = [{ event: 'agent.session.*', description: 'Cleans up.', handler: 'subscription:agent.session.*' }];
      manifest.data.version = 2;
      manifest.data.migrations = [{ to: 2, handler: 'migration:2' }];
      manifest.llm.providers = [{ id: 'acme-llm', title: 'Acme', description: 'Acme models.', auth: 'none',
        functions: ['provider:acme-llm.complete', 'provider:acme-llm.status', 'provider:acme-llm.countTokens'] }];
    });
    expect(manifestSchema.safeParse(accepted).success).toBe(true);
    expect(pathsOf((manifest) => (manifest.data.migrations = [{ to: 2, handler: 'migration:3' }]))).toEqual(['data.migrations.0.handler']);
  });

  it('M0.3-E3 lane templates follow 02 §2.6', () => {
    for (const template of ['file:{{ $payload.fileId }}', 'session:{{ $context.sessionId }}', 'job:{{ $message.id }}',
      'section:{{ $message.source }}.{{ $payload.id }}:{{ $payload.sessionId }}', 'x:{{$payload.a.b}}']) {
      expect(laneTemplateSchema.safeParse(template).success, template).toBe(true);
    }
    for (const template of ['singleton', 'x:{{ $state.x }}', 'x:{{ $message.other }}', 'x:{{ $payload.id }', 'x:{{ $payload.id }}}']) {
      expect(laneTemplateSchema.safeParse(template).success, template).toBe(false);
    }
  });

  it('M0.3-E4 capability requests have the right shape', () => {
    expect(pathsOf((manifest) => (manifest.permissions.capabilities = [{ name: 'calls', reason: 'r' } as never]))).toEqual(['permissions.capabilities.0']);
    expect(pathsOf((manifest) => (manifest.permissions.capabilities = [{ name: 'llm', reason: 'r', types: ['a.b'] } as never]))).toEqual(['permissions.capabilities.0']);
    expect(pathsOf((manifest) => (manifest.permissions.capabilities = [{ name: 'calls', reason: 'r', types: ['*'] }]))).toEqual(['permissions.capabilities.0.types.0']);
    expect(pathsOf((manifest) => (manifest.permissions.capabilities = [{ name: 'root', reason: 'r' } as never]))).toEqual(['permissions.capabilities.0']);
  });

  it('M0.3-E5 only shared or dedicated isolation is requested', () => {
    expect(pathsOf((manifest) => (manifest.permissions.isolation = { mode: 'sandboxed', reason: 'r' } as never))).toEqual(['permissions.isolation.mode']);
    expect(manifestSchema.safeParse(withChange((manifest) => (manifest.permissions.isolation = { mode: 'dedicated', reason: 'native code' }))).success).toBe(true);
  });

  it('M0.3-E6 live events declare chunk and never payload', () => {
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.progress.updated')['payload'] = { type: 'object' }))).toEqual(['types.2.chunk']);
    expect(pathsOf((manifest) => delete typeEntry(manifest, 'pdf.progress.updated')['chunk'])).toEqual(['types.2.chunk']);
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.imported')['chunk'] = 'text'))).toEqual(['types.0.chunk']);
  });

  it('M0.3-E7 timeouts, concurrency, and durations are bounded', () => {
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translate')['timeoutMs'] = 86_400_001))).toEqual(['types.4.timeoutMs']);
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translate')['concurrency'] = 0))).toEqual(['types.4.concurrency']);
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translate')['retention'] = '7 days'))).toEqual(['types.4.retention']);
    expect(manifestSchema.safeParse(withChange((manifest) => (typeEntry(manifest, 'pdf.translate')['retention'] = '7d'))).success).toBe(true);
  });

  it('M0.3-E8 slash names are kebab-case and query tools cannot be dangerous', () => {
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.translate')['slash'] = { name: 'Translate', description: 'd' }))).toEqual(['types.4.slash.name']);
    expect(pathsOf((manifest) => (typeEntry(manifest, 'pdf.files.list')['agentTool'] = { title: 'List', dangerous: true }))).toEqual(['types.6.agentTool']);
  });

  it('M0.3-E9 schedules and private names follow ADR 0016', () => {
    const schedule = { name: 'prune', description: 'Hourly cleanup.', command: 'pdf.files.prune' };
    expect(pathsOf((manifest) => (manifest.schedules = [{ ...schedule, every: '1h', cron: '0 * * * *' }]))).toEqual(['schedules.0.every']);
    expect(pathsOf((manifest) => (manifest.schedules = [schedule]))).toEqual(['schedules.0.every']);
    expect(pathsOf((manifest) => (manifest.schedules = [{ ...schedule, name: 'Files', every: '1h' }]))).toEqual(['schedules.0.name']);
    expect(pathsOf((manifest) => (manifest.data.logs = [{ prefix: 'history:*:x', description: 'd', entry: {} }]))).toEqual(['data.logs.0.prefix']);
    const accepted = withChange((manifest) => {
      manifest.data.logs = [{ prefix: 'history:*', description: 'Session history.', entry: {} }];
      manifest.data.collections.push({ name: 'childRuns', description: 'Subagent runs.', schema: {}, idField: 'childSessionId' });
    });
    expect(manifestSchema.safeParse(accepted).success).toBe(true);
  });

  it('M0.3-E10 error codes and UI descriptions are checked', () => {
    expect(pathsOf((manifest) => (manifest.errors[0] = { ...pdfManifest.errors[0], code: 'NOT_FOUND' } as never))).toEqual(['errors.0.code']);
    expect(pathsOf((manifest) => delete (manifest.ui.pages[0] as Mutable)['description'])).toEqual(['ui.pages.0.description']);
  });
});
