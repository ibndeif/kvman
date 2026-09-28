import { jsonObjectSchema, problemSchema, validateResultSchema, type Json, type ValidateResult } from '@kvman/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import kiosk from '../../../protocol/test/fixtures/kiosk-preset.json' with { type: 'json' };
import { send, type HttpAnswer } from '../adapters/http-client.ts';
import { workerTests, workspaceA } from '../hosts/harness.ts';
import { pdfManifest, setAt } from '../validation/harness.ts';
import { bootSchemaFixture, type SchemaFixture } from './harness.ts';

let fixture: SchemaFixture;
beforeEach(async () => {
  fixture = await bootSchemaFixture();
});
afterEach(async () => {
  await fixture.close();
});

function validate(payload: Json): Promise<HttpAnswer> {
  return send(fixture.port, 'POST', '/api/v1/queries/kernel.validate', { body: { payload } });
}

async function validated(payload: Json): Promise<ValidateResult> {
  const answer = await validate(payload);
  expect(answer.status).toBe(200);
  return validateResultSchema.parse(jsonObjectSchema.parse(answer.json)['data']);
}

// The kiosk preset without its config, which names an extension this kernel does not have installed.
function preset(config?: Json): Json {
  const copy = jsonObjectSchema.parse(structuredClone(kiosk));
  delete copy['config'];
  return config === undefined ? copy : { ...copy, config };
}

const page = { description: 'How to use this app.', route: '/help', title: 'Help', view: { type: 'markdown', source: 'Read me.' } };

describe('kernel.validate (plan 03 §3.8, ADR 0110)', workerTests, () => {
  it('M2.1-E23 a valid manifest is ok; errors make ok false, warnings keep their severity', async () => {
    expect(await validated({ manifest: pdfManifest() })).toEqual({ ok: true, issues: [] });
    const broken = pdfManifest((manifest) => {
      setAt(manifest, ['types', 3, 'type'], 'pdf.imported-file');
      setAt(manifest, ['types', 3, 'handler'], 'command:pdf.imported-file');
      setAt(manifest, ['errors', 0, 'title'], '');
    });
    const result = await validated({ manifest: broken });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'errors.0.title', hint: 'add an English title' }),
      expect.objectContaining({ path: 'types.3.type', severity: 'warning' }),
    ]));
  });

  it('M2.1-E24 warnings alone are ok', async () => {
    const warned = pdfManifest((manifest) => {
      setAt(manifest, ['types', 3, 'type'], 'pdf.imported-file');
      setAt(manifest, ['types', 3, 'handler'], 'command:pdf.imported-file');
      // The upload on the files page sends the renamed command (its target is checked since M2.10, ADR 0157).
      setAt(manifest, ['ui', 'pages', 0, 'view', 'children', 1, 'onUpload', 'command'], 'pdf.imported-file');
    });
    const result = await validated({ manifest: warned });
    expect(result).toEqual({ ok: true, issues: [expect.objectContaining({ path: 'types.3.type', severity: 'warning' })] });
  });

  it('M2.1-E25 a preset is checked against its schema and for secrets of installed extensions', async () => {
    expect(await validated({ preset: preset() })).toEqual({ ok: true, issues: [] });
    const unknownField = await validated({ preset: { ...jsonObjectSchema.parse(preset()), color: 'red' } });
    expect(unknownField).toEqual({ ok: false, issues: [{ path: '', message: expect.any(String), hint: 'remove "color"' }] });
    const secret = await validated({ preset: preset({ '@acme/files': { token: 'abc' } }) });
    expect(secret).toEqual({ ok: false, issues: [{ path: 'config.@acme/files.token', message: 'secrets never go into presets', hint: 'remove the value; the person enters secrets on the settings page' }] });
  });

  it('M2.1-E26 a page is checked with the view validator', async () => {
    expect(await validated({ page })).toEqual({ ok: true, issues: [] });
    const result = await validated({ page: { ...page, view: { type: 'no-such-component' } } });
    expect(result.ok).toBe(false);
    expect(result.issues.every((issue) => issue.path.startsWith('view'))).toBe(true);
  });

  it('M2.1-E27 workspaceId runs the referential checks', async () => {
    expect(await validated({ manifest: pdfManifest(), workspaceId: workspaceA })).toEqual({ ok: true, issues: [] });
  });

  it('M2.1-E28 nothing to validate, or two things, fails at admission', async () => {
    for (const payload of [{}, { manifest: pdfManifest(), page }]) {
      const answer = await validate(payload);
      expect([answer.status, problemSchema.parse(answer.json).code]).toEqual([400, 'VALIDATION_FAILED']);
    }
  });
});
