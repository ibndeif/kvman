import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawDiagrams } from '../../web/src/components/views/mermaid-diagrams.ts';
import { mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

// Mermaid needs a real browser's layout to draw, and this simulated one's sanitizer keeps no SVG at all, so what the
// drawing looks like and carries is tested in Chromium (test/e2e/mermaid.test.ts). Here Mermaid answers as it would,
// and the view's own part is tested: which block it draws, what it asks Mermaid for, and what it remembers.
const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn((source: string) => Promise.resolve(!source.includes('not a diagram'))),
  render: vi.fn((id: string, source: string) => Promise.resolve({ svg: `<svg id="${id}" viewBox="0 0 10 10"><script>alert(1)</script><g onclick="alert(2)"><text>${source.trim().split('\n')[0] ?? ''}</text></g></svg>` })),
}));
vi.mock('mermaid', () => ({ default: mermaid }));

const flow = '```mermaid\nflowchart TD\n  A --> B\n```';

async function shown(body: string) {
  const api = notesApi({ ui: notesUi({ pages: [{ id: 'list', title: 'notes.pages.list', view: { type: 'markdown', query: 'notes.note.get', input: {}, field: 'body' } }] }) });
  api.handlers.set('notes.note.get', () => ({ body }));
  const app = await mountApp(api, '/notes/list');
  const block = app.find('[data-test="markdown"]');
  return block;
}

function marked(source: string): HTMLElement {
  const root = document.createElement('div');
  const block = document.createElement('pre');
  block.dataset['mermaid'] = 'source';
  block.textContent = source;
  root.append(block);
  document.body.append(root);
  return root;
}

beforeEach(() => {
  for (const call of Object.values(mermaid)) call.mockClear();
});

describe('Mermaid diagrams in Markdown (06 §6.4, ADR 0067)', () => {
  it('M2.4-E248 a mermaid block is drawn in its place, another code block is left, and Mermaid runs strict', async () => {
    const block = await shown(`Before.\n\n${flow}\n\n\`\`\`js\nconst a = 1;\n\`\`\``);
    await vi.waitFor(() => expect(block?.querySelector('.kvwebui-mermaid[data-mermaid="drawn"]')).not.toBeNull());
    expect(block?.querySelector('[data-mermaid="source"]')).toBeNull();
    expect(mermaid.render).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^kvwebui-mermaid-\d+$/), 'flowchart TD\n  A --> B\n');
    expect([...(block?.querySelectorAll('pre') ?? [])].map((code) => code.textContent)).toEqual(['const a = 1;\n']);
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'neutral' }));
  });

  it('M2.4-E249 a block that is no diagram stays as its source and is never drawn', async () => {
    const invalid = marked('this is not a diagram\n');
    await drawDiagrams(invalid);
    expect(invalid.querySelector('pre[data-mermaid="source"]')?.textContent).toBe('this is not a diagram\n');
    expect(mermaid.render).not.toHaveBeenCalled();
    const valid = marked('sequenceDiagram\n  A->>B: hi\n');
    await drawDiagrams(valid);
    expect(valid.querySelector('pre')).toBeNull();
    expect(valid.querySelector('.kvwebui-mermaid[data-mermaid="drawn"]')).not.toBeNull();
  });

  it("M2.4-E250 a diagram drawn once isn't drawn again for the same source, and is for another", async () => {
    const source = 'pie\n  "a": 1\n';
    await drawDiagrams(marked(source));
    await drawDiagrams(marked(source));
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    const again = marked(source);
    await drawDiagrams(again);
    expect(again.querySelector('.kvwebui-mermaid[data-mermaid="drawn"]')).not.toBeNull();
    await drawDiagrams(marked('pie\n  "b": 2\n'));
    expect(mermaid.render).toHaveBeenCalledTimes(2);
  });
});
