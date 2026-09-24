import { describe, expect, it } from 'vitest';
import { actionSchema, effectSchema, formatSchema, pageDefSchema, validateViewNode, viewNodeSchema, type ViewNode } from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';
import pdfManifestFixture from './fixtures/pdf-manifest.json' with { type: 'json' };

const standalone = { placement: 'standalone', childrenNodeAllowed: false } as const;

function paths(node: unknown): string[] {
  return validateViewNode(node, standalone).map((issue) => issue.path);
}

function page(view: ViewNode): Record<string, unknown> {
  return { description: 'A test page.', route: '/test', title: '$t.test', view };
}

describe('views (plan 08 §8.7–§8.8, ADRs 0024, 0029)', () => {
  it('M0.4-H1 the pages of 08 §8.21 validate', () => {
    expect(pdfManifestFixture.ui.pages).toHaveLength(2);
    for (const { id: _id, ...definition } of pdfManifestFixture.ui.pages) expectRoundTrip(pageDefSchema, definition);
  });

  it('M0.4-H3 a tab outside tabs fails with its path', () => {
    const view = { type: 'stack', children: [{ type: 'tab', id: 'a', label: '$t.a' }] };
    const result = pageDefSchema.safeParse(page(view));
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([['view.children.0', 'tab appears only inside tabs']]);
  });

  it('M0.4-H4 an unknown prop fails with its path', () => {
    expect(paths({ type: 'row', children: [{ type: 'button', label: '$t.ok', onClick: { navigate: '/files' }, colour: 'red' }] })).toEqual(['children.0']);
  });

  it('M0.4-H5 a malformed binding path fails with its path', () => {
    expect(paths({ type: 'heading', text: '$item..name' })).toEqual(['text']);
  });

  it('M0.4-E5 children rules and parents', () => {
    expect(paths({ type: 'text', text: 'x', children: [{ type: 'divider' }] })).toEqual(['children.0']);
    expect(paths({ type: 'tabs', children: [{ type: 'stack' }] })).toEqual(['children.0']);
    expect(paths({ type: 'menu', label: '$t.more', children: [{ type: 'button', label: '$t.ok', onClick: { navigate: '/' } }] })).toEqual(['children.0']);
    expect(paths({ type: 'stack', children: [{ type: 'menuItem', label: '$t.ok', onClick: { navigate: '/' } }] })).toEqual(['children.0']);
    expect(paths({ type: 'actionGroup', children: [
      { type: 'button', label: '$t.ok', onClick: { navigate: '/' } },
      { type: 'menu', label: '$t.more', children: [{ type: 'menuItem', label: '$t.x', onClick: { navigate: '/' } }, { type: 'divider' }] },
    ] })).toEqual([]);
  });

  it('M0.4-E6 a children node belongs only in a composite that declares children', () => {
    const view = { type: 'card', children: [{ type: 'heading', text: '$props.title' }, { type: 'children' }] };
    expect(paths(view)).toEqual(['children.1.type']);
    expect(validateViewNode(view, { placement: 'standalone', childrenNodeAllowed: true })).toEqual([]);
  });

  it('M0.4-E7 split takes exactly two children', () => {
    const child = { type: 'text', text: '$t.x' };
    expect(paths({ type: 'split', children: [child] })).toEqual(['children']);
    expect(paths({ type: 'split', children: [child, child] })).toEqual([]);
    expect(paths({ type: 'split', children: [child, child, child] })).toEqual(['children']);
  });

  it('M0.4-E8 unknown built-in names fail; extension components wait for M2.10', () => {
    expect(paths({ type: 'carousel' })).toEqual(['type']);
    expect(paths({ type: 'pdf.viewer', blobId: '$query.file.blobId' })).toEqual([]);
  });

  it('M0.4-E9 required props are required', () => {
    expect(paths({ type: 'grid', children: [] })).toEqual(['columns']);
    expect(paths({ type: 'upload', accept: ['application/pdf'] })).toEqual(['onUpload']);
  });

  it('M0.4-E10 conditions use bindings as keys', () => {
    const shown = (visibleIf: unknown) => paths({ type: 'text', text: '$t.x', visibleIf });
    expect(shown({ '$item.status': { in: ['ready', 'translated'] }, '$state.mode': 'edit' })).toEqual([]);
    expect(shown({ $or: [{ '$item.shared': true }, { '$item.owner': '$user.id' }] })).toEqual([]);
    expect(shown({ status: 'ready' })).toEqual(['visibleIf.status']);
    expect(shown({ '$item.size': { between: [1, 2] } })).toEqual(['visibleIf.$item.size']);
  });

  it('M0.4-E11 every action and effect form', () => {
    const actions = [
      { command: 'pdf.translate', payload: { fileId: '$item.id' }, form: { submitLabel: '$t.go' }, confirm: { title: '$t.sure' },
        busyLabel: '$t.busy', then: [{ toast: '$t.done', level: 'success' }, { navigate: '/files', pane: 'side' }, { refresh: 'files' },
          { set: { '$state.open': false } }, { closeDialog: true }] },
      { navigate: '/files/{{ $item.id }}', pane: 'side' },
      { openDialog: { title: '$t.details', view: { type: 'json', value: '$item' } } },
      { openGrantDialog: { command: 'kernel.extension.enable', payload: { workspaceId: '$workspace.id', name: '@acme/pdf' } } },
      { set: { '$state.filter': '$value' } },
      '$props.onOpen',
    ];
    for (const action of actions) expect(actionSchema.safeParse(action).success, JSON.stringify(action)).toBe(true);
    expect(issuePaths(actionSchema, { set: { filter: 1 } })).toEqual(['']);
    expect(actionSchema.safeParse({ openGrantDialog: { command: 'pdf.translate', payload: {} } }).success).toBe(false);
    expect(effectSchema.safeParse({ closeDialog: false }).success).toBe(false);
  });

  it('M0.4-E12 nested views are validated at their full path', () => {
    const broken = { type: 'heading', text: '$item..name' };
    expect(paths({ type: 'button', label: '$t.x', onClick: { openDialog: { title: '$t.x', view: broken } } })).toEqual(['onClick.openDialog.view.text']);
    expect(paths({ type: 'page', actions: [broken] })).toEqual(['actions.0.text']);
    expect(paths({ type: 'list', data: '$query.items', item: broken })).toEqual(['item.text']);
  });

  it('M0.4-E13 page params are string, number, or boolean', () => {
    const view = { type: 'text', text: '$route.fileId' };
    expect(pageDefSchema.safeParse({ ...page(view), params: { fileId: 'string' } }).success).toBe(true);
    expect(issuePaths(pageDefSchema, { ...page(view), params: { fileId: 'date' } })).toEqual(['params.fileId']);
  });

  it('M0.4-E14 every format of 08 §8.5', () => {
    for (const format of ['date', 'time', 'dateTime', 'relative', 'number', 'integer', 'percent', 'currency:USD', 'bytes', 'duration']) {
      expect(formatSchema.safeParse(format).success, format).toBe(true);
    }
    for (const format of ['currency:', 'money']) expect(formatSchema.safeParse(format).success, format).toBe(false);
    expect(viewNodeSchema.safeParse({ type: 'text', text: '$item.size', format: 'bytes' }).success).toBe(true);
  });
});
