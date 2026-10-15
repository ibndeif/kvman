import { describe, expect, it } from 'vitest';
import { previewAnswer, withKindHint } from '../../src/preview/preview-call.ts';

describe("what a preview call answers (09 §9.3, ADR 0022, 14)", () => {
  it("QA34-E16 the preview's envelope is answered without its job id, and anything else fails kvbuilder/PREVIEW_FAILED", () => {
    expect(previewAnswer({ ok: true, output: { text: 'Hello' }, jobId: 'j1' })).toEqual({ ok: true, output: { text: 'Hello' } });
    expect(previewAnswer({ ok: false, problem: { code: 'NOT_FOUND', message: 'No such query.' }, jobId: 'j2' })).toEqual({ ok: false, problem: { code: 'NOT_FOUND', message: 'No such query.' } });
    expect(previewAnswer({ ok: false, problem: { code: 'notes/FULL', message: 'Full.', params: { limit: 3 } } })).toEqual({ ok: false, problem: { code: 'notes/FULL', message: 'Full.', params: { limit: 3 } } });
    for (const other of ['<html>', null, { ok: true }, { ok: false }, { output: 1 }]) {
      expect(() => previewAnswer(other), JSON.stringify(other)).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'kvbuilder/PREVIEW_FAILED' }) }));
    }
  });

  it("QA52-H9 a NOT_FOUND for the name called says to use the other kind of call, and anything else is the preview's own", () => {
    const missing = (message: string, name: string) => ({ ok: false as const, problem: { code: 'NOT_FOUND', message, params: { name } } });
    expect(withKindHint(missing('There is no command x.y.get.', 'x.y.get'), 'commands', 'x.y.get')).toEqual(missing('There is no command x.y.get. If it is a query, run it with preview query-get.', 'x.y.get'));
    expect(withKindHint(missing('There is no query x.y.add.', 'x.y.add'), 'queries', 'x.y.add')).toEqual(missing('There is no query x.y.add. If it is a command, run it with preview command-run.', 'x.y.add'));
    expect(withKindHint(missing('There is no command other.get.', 'other.get'), 'commands', 'x.y.get')).toEqual(missing('There is no command other.get.', 'other.get'));
    expect(withKindHint({ ok: true, output: { done: true } }, 'commands', 'x.y.get')).toEqual({ ok: true, output: { done: true } });
  });
});
