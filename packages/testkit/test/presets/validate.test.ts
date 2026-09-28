import { jsonSchema, validateResultSchema, type ValidateResult } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { installed, type InstallFixture } from '../install/harness.ts';
import type { LocalRegistry } from '../install/registries.ts';
import { unknownWorkspace } from '../schema/harness.ts';
import { query } from '../workspaces/harness.ts';
import { integrityOf, openPresetFixture, pdfGrants, presetP, presetTests, startPresetRegistry } from './harness.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startPresetRegistry();
});

afterAll(async () => {
  await registry.close();
});

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function openFixture(): InstallFixture {
  if (fixture === undefined) throw new Error('no fixture is open');
  return fixture;
}

function validated(answer: unknown): ValidateResult {
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) {
    throw new Error(`the validation did not answer: ${JSON.stringify(answer)}`);
  }
  return validateResultSchema.parse(answer.value);
}

describe('kernel.validate against a workspace (plan 06 §6.3, ADR 0151)', presetTests, () => {
  it('M2.8-E48 a missing type, a bad config, and a namespace clash fail; unknown workspaces and catalogs are refused', async () => {
    fixture = await openPresetFixture(registry);
    const current = openFixture();
    await installed(current, 'npm:@acme/pdf@1.0.0');
    current.enable(workspaceA, '@acme/pdf', pdfGrants('1.0.0'));
    await installed(current, 'npm:@acme/reader@1.0.0');
    await installed(current, 'npm:@acme/clash@1.0.0');
    const pdf = await integrityOf('@acme/pdf', '1.0.0');
    const reader = await integrityOf('@acme/reader', '1.0.0');

    const readerGrants = {
      isolation: 'sandboxed', requested: [{ name: 'calls', types: ['pdf.files.list'] }], derived: { subscribes: [], providesLlm: [] },
    };
    const lonely = jsonSchema.parse({
      ...presetP(pdf, { extensions: {} }),
      id: 'lonely-reader',
      name: 'Lonely Reader',
      extensions: { '@acme/reader': { source: 'npm:@acme/reader@1.0.0', integrity: reader, enabled: true, grants: readerGrants } },
    });
    expect(validated(await query(current, 'kernel.validate', { workspaceId: workspaceA, preset: lonely }))).toEqual({
      ok: false,
      issues: [
        { path: 'extensions.@acme/reader', message: 'pdf.files.list is not provided' },
        // Since M2.10, hidden ids nothing enabled has are warnings (06 §6.3, ADR 0157).
        { path: 'hidden.0', message: 'nothing enabled here has the id settings.nav-general', severity: 'warning' },
        { path: 'hidden.1', message: 'nothing enabled here has the id pdf.debug', severity: 'warning' },
      ],
    });

    const limited = jsonSchema.parse(presetP(pdf, { config: { '@acme/pdf': { limit: 50 } } }));
    const configAnswer = validated(await query(current, 'kernel.validate', { workspaceId: workspaceA, preset: limited }));
    expect(configAnswer.ok).toBe(false);
    expect(configAnswer.issues.filter((issue) => issue.severity !== 'warning')).toEqual([expect.objectContaining({ path: 'config.@acme/pdf.limit' })]);

    const clash = current.runtime.registry.current().manifestOf('@acme/clash');
    if (clash === undefined) throw new Error('@acme/clash is not installed');
    const clashAnswer = validated(await query(current, 'kernel.validate', { workspaceId: workspaceA, manifest: jsonSchema.parse(clash) }));
    expect(clashAnswer.ok).toBe(false);
    expect(clashAnswer.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'extensions.@acme/clash', message: expect.stringContaining('"pdf"') }),
    ]));

    expect(await query(current, 'kernel.validate', { workspaceId: unknownWorkspace, preset: limited })).toMatchObject({
      ok: false, problem: { code: 'WORKSPACE_INVALID' },
    });
    expect(await query(current, 'kernel.validate', { catalog: { hello: 'Hello' } })).toMatchObject({
      ok: false, problem: { code: 'VALIDATION_FAILED', issues: [{ path: 'catalog', hint: 'validate a manifest, preset, or page' }] },
    });
  });
});
