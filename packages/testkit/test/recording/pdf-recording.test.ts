import { canonicalJson, jsonSchema, type Json } from '@kvman/protocol';
import { recordExtension } from '@kvman/kernel';
import { describe, expect, it } from 'vitest';
import fixture from '../../../protocol/test/fixtures/pdf-manifest.json' with { type: 'json' };
import { correlationId } from './harness.ts';
import { pdfExtension as pdf } from './pdf-extension.ts';

const emptyUi = {
  pages: [], navGroups: [], navItems: [], toolbarItems: [], statusItems: [], panels: [], slots: [], actions: [],
  rendererTargets: [], renderers: [], components: [], settingsSection: null,
};

describe('recording the pdf example (plan 05 §5.2, §5.12)', () => {
  it('M1.3-H1 the non-UI calls produce the M0.3 fixture', () => {
    const { manifest, functions } = recordExtension(pdf, { version: '1.2.0', correlationId });
    const expected: Json = { ...fixture, ui: emptyUi, translations: null };
    expect(canonicalJson(jsonSchema.parse(manifest))).toBe(canonicalJson(expected));
    expect([...functions.keys()]).toEqual([
      'command:pdf.import', 'command:pdf.translate', 'command:pdf.files.prune',
      'query:pdf.files.list', 'query:pdf.files.count', 'query:pdf.file.get',
    ]);
    for (const handle of functions.values()) expect(typeof handle).toBe('function');
  });
});
