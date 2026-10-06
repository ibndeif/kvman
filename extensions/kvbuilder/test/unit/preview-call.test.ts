import { describe, expect, it } from 'vitest';
import { previewAnswer } from '../../src/preview/preview-call.ts';

describe("what a preview call answers (09 §9.3, ADR 0022, 14)", () => {
  it("QA34-E16 the preview's envelope is answered without its job id, and anything else fails kvbuilder/PREVIEW_FAILED", () => {
    expect(previewAnswer({ ok: true, output: { text: 'Hello' }, jobId: 'j1' })).toEqual({ ok: true, output: { text: 'Hello' } });
    expect(previewAnswer({ ok: false, problem: { code: 'NOT_FOUND', message: 'No such query.' }, jobId: 'j2' })).toEqual({ ok: false, problem: { code: 'NOT_FOUND', message: 'No such query.' } });
    expect(previewAnswer({ ok: false, problem: { code: 'notes/FULL', message: 'Full.', params: { limit: 3 } } })).toEqual({ ok: false, problem: { code: 'notes/FULL', message: 'Full.', params: { limit: 3 } } });
    for (const other of ['<html>', null, { ok: true }, { ok: false }, { output: 1 }]) {
      expect(() => previewAnswer(other), JSON.stringify(other)).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'kvbuilder/PREVIEW_FAILED' }) }));
    }
  });
});
