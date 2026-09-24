import { describe, expect, it } from 'vitest';
import { stageResultSchema } from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const stageResult = {
  name: '@acme/pdf',
  version: '1.4.2',
  title: '$t.meta.title',
  summary: '$t.meta.summary',
  description: 'Import PDF files and translate them with the configured AI model.',
  namespace: 'pdf',
  source: 'npm:@acme/pdf@1.4.2',
  digest: 'e'.repeat(64),
  integrity: 'sha512-3h0R1qM1xQyPpF0mZ4R3kWm7i5vT2tGmS0b4Vd8uYxN2Q7pZr1sJk5Lw9cA6eHf8gD2oB4nC7mX1zY3uT5vW9A==',
  capabilities: {
    requested: [{ name: 'llm', reason: '$t.reasons.llm' }, { name: 'calls', reason: '$t.reasons.calls', types: ['ocr.extract'] }],
    derived: { subscribes: ['agent.session.deleted'], providesLlm: [] },
  },
  isolation: { mode: 'dedicated', reason: '$t.reasons.native' },
  types: [{ type: 'pdf.translate', kind: 'command', access: 'all', agentTool: true }, { type: 'pdf.translated', kind: 'event', agentTool: false }],
  contributions: [{ id: 'pdf.files', kind: 'page' }, { id: 'pdf.queue', kind: 'statusItem', slot: 'frame.statusbar.end' },
    { id: 'pdf.preview', kind: 'renderer', target: 'mime:application/pdf' }],
  warnings: [{ path: 'dependencies.sharp', message: 'uses native code', code: 'NATIVE_CODE', severity: 'warning' }],
  translations: {
    en: { title: 'PDF Translator', summary: 'Import PDF files and translate them.', reasons: { llm: 'Translates documents with your AI model' } },
    ar: { title: 'مترجم PDF', reasons: { llm: 'يترجم المستندات بنموذج الذكاء الاصطناعي الخاص بك' } },
  },
  confirmationToken: 'token-1',
  expiresAt: 1_790_000_600_000,
};

describe('stage result (plan 06 §6.2, ADR 0015)', () => {
  it('M0.3-E23 a stage result round-trips and needs its confirmation token', () => {
    expectRoundTrip(stageResultSchema, stageResult);
    const { confirmationToken: _token, ...withoutToken } = stageResult;
    expect(issuePaths(stageResultSchema, withoutToken)).toEqual(['confirmationToken']);
  });
});
