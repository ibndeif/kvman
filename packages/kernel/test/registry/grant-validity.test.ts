import type { Capabilities, Manifest } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { grantDifferences } from '../../src/index.ts';
import { manifest, subscription } from './manifests.ts';

const asker: Manifest = {
  ...manifest('@acme/asker', 'asker', { subscriptions: [subscription('pdf.imported'), subscription('kernel.extension.installed'), subscription('asker.asked')] }),
  permissions: {
    capabilities: [{ name: 'calls', reason: 'Imports PDFs.', types: ['pdf.*'] }, { name: 'llm', reason: 'Summarizes.' }],
    isolation: { mode: 'dedicated', reason: 'Runs a parser.' }, requireTypes: [], requireComponents: [],
  },
  llm: { providers: [{ id: 'asker-local', title: 'Local', description: 'A local model.', auth: 'none', functions: ['provider:asker-local.complete', 'provider:asker-local.status'] }], models: [] },
};

const exact: Capabilities = {
  isolation: 'sandboxed',
  requested: [{ name: 'llm' }, { name: 'calls', types: ['pdf.*'] }],
  derived: { subscribes: ['pdf.imported'], providesLlm: ['asker-local'] },
};

describe('the grant check (plan 05 §5.7, ADR 0123)', () => {
  it('M2.3-E19 a grant must hold exactly what the manifest requests and derives, in any order', () => {
    expect(grantDifferences(asker, exact, false)).toBeUndefined();
    expect(grantDifferences(asker, { ...exact, requested: [...exact.requested, { name: 'process' }] }, false)).toEqual({ missing: [], unexpected: ['process'] });
    expect(grantDifferences(asker, { ...exact, requested: [{ name: 'llm' }, { name: 'calls', types: ['pdf.import'] }] }, false)).toEqual({ missing: ['calls pdf.*'], unexpected: ['calls pdf.import'] });
    expect(grantDifferences(asker, { ...exact, derived: { subscribes: ['pdf.imported', 'ocr.done'], providesLlm: ['asker-local'] } }, false)).toEqual({ missing: [], unexpected: ['subscribes ocr.done'] });
    expect(grantDifferences(asker, { ...exact, derived: { subscribes: ['pdf.imported'], providesLlm: [] } }, false)).toEqual({ missing: ['providesLlm asker-local'], unexpected: [] });
  });

  it('M2.3-E20 isolation is sandboxed or the level requested; builtins run shared', () => {
    expect(grantDifferences(asker, { ...exact, isolation: 'shared' }, false)).toEqual({ missing: [], unexpected: [], isolation: 'shared isolation was not requested' });
    expect(grantDifferences(asker, { ...exact, isolation: 'dedicated' }, false)).toBeUndefined();
    expect(grantDifferences(asker, exact, false)).toBeUndefined();
    expect(grantDifferences(asker, exact, true)).toEqual({ missing: [], unexpected: [], isolation: 'a builtin extension runs shared, not sandboxed' });
    expect(grantDifferences(asker, { ...exact, isolation: 'shared' }, true)).toBeUndefined();
  });
});
