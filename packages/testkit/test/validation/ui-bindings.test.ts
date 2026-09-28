import { z, type Ext } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { checkedIssues, errorsOf, recordedIssues } from './harness.ts';

const handle = async (): Promise<null> => null;

function fileEntity(ext: Ext): void {
  ext.registerEntity('pdf.file', {
    description: 'File.', title: 'File', schema: z.object({ id: z.string(), name: z.string() }), display: { title: '$item.name' },
  });
}

function filesQuery(ext: Ext): void {
  ext.registerQuery('pdf.files.list', {
    description: 'Lists.', input: z.object({}),
    output: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })), total: z.number() }),
    handle: async () => ({ items: [], total: 0 }),
  });
}

describe('UI bindings and values (ADR 0157)', () => {
  it('M2.10-E14 $slot paths are checked against the slot’s props', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerSlot('pdf.tray', { description: 'Tray.', accepts: ['panel'], props: z.object({ fileId: z.string() }) });
      ext.registerPanel('pdf.good', { description: 'Good.', slot: 'pdf.tray', view: { type: 'text', text: '$slot.fileId' } });
      ext.registerPanel('pdf.bad', { description: 'Bad.', slot: 'pdf.tray', view: { type: 'text', text: '$slot.nope' } });
      ext.registerPanel('pdf.frame', { description: 'Frame.', slot: 'frame.overlay', view: { type: 'text', text: '$slot.x' } });
    }))).toEqual([
      {
        path: 'ui.panels.1.view.text', message: '$slot.nope does not exist in the props of pdf.tray',
        hint: 'fields there: fileId',
      },
      {
        path: 'ui.panels.2.view.text', message: 'frame.overlay is a frame slot, which passes no props',
        hint: 'read $slot only in an extension slot that declares props',
      },
    ]);
  });
  it('M2.10-E15 $props paths are checked against the composite’s props', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerComponent('pdf.card', {
        description: 'Card.', props: z.object({ file: z.object({ name: z.string() }) }),
        view: { type: 'stack', children: [{ type: 'text', text: '$props.file.name' }, { type: 'text', text: '$props.file.size' }] },
      });
    }))).toEqual([{
      path: 'ui.components.0.view.children.1.text', message: '$props.file.size does not exist in the props of pdf.card',
      hint: 'fields there: name',
    }]);
  });
  it('M2.10-E16 $item paths are checked against the entity or target, never for mime: renderers', () => {
    const missing = '$item.nope does not exist in the entity pdf.file';
    const hint = 'fields there: id, name';
    expect(errorsOf(recordedIssues((ext) => {
      fileEntity(ext);
      filesQuery(ext);
      ext.registerCommand('pdf.translate', { description: 'Translates.', input: z.object({ fileId: z.string() }), handle });
      ext.registerComponent('pdf.viewer', {
        description: 'Viewer.', props: z.object({ blobId: z.string() }), widget: 'widgets/viewer.html',
      });
      ext.registerAction('pdf.inspect', {
        description: 'Inspect.', entity: 'pdf.file', label: '$item.nope',
        command: 'pdf.translate', payload: { fileId: '$item.id' },
      });
      ext.registerRenderer('pdf.row', { description: 'Row.', target: 'entity:pdf.file', view: { type: 'text', text: '$item.nope' } });
      ext.registerPage('pdf.table', {
        description: 'Table.', route: '/table', title: 'Table', queries: { files: { query: 'pdf.files.list' } },
        view: {
          type: 'table', entity: 'pdf.file', data: '$query.files.items', columns: [{ label: 'Name', field: 'name' }],
          onRowClick: { navigate: '/files/{{ $item.nope }}' },
        },
      });
      ext.registerPage('pdf.list', {
        description: 'List.', route: '/list', title: 'List', queries: { files: { query: 'pdf.files.list' } },
        view: { type: 'list', entity: 'pdf.file', data: '$query.files.items', item: { type: 'text', text: '$item.nope' } },
      });
    }))).toEqual([
      { path: 'ui.pages.0.view.onRowClick.navigate', message: missing, hint },
      { path: 'ui.pages.1.view.item.text', message: missing, hint },
      { path: 'ui.renderers.0.view.text', message: missing, hint },
      { path: 'ui.actions.0.label', message: missing, hint },
    ]);
    expect(errorsOf(recordedIssues((ext) => {
      fileEntity(ext);
      filesQuery(ext);
      ext.registerCommand('pdf.translate', { description: 'Translates.', input: z.object({ fileId: z.string() }), handle });
      ext.registerComponent('pdf.viewer', {
        description: 'Viewer.', props: z.object({ blobId: z.string() }), widget: 'widgets/viewer.html',
      });
      ext.registerAction('pdf.inspect', {
        description: 'Inspect.', entity: 'pdf.file', label: '$item.name',
        command: 'pdf.translate', payload: { fileId: '$item.id' },
      });
      ext.registerRenderer('pdf.row', { description: 'Row.', target: 'entity:pdf.file', view: { type: 'text', text: '$item.name' } });
      ext.registerRenderer('pdf.mime', {
        description: 'Mime.', target: 'mime:application/pdf', component: 'pdf.viewer', props: { blobId: '$item.anything' },
      });
      ext.registerPage('pdf.table', {
        description: 'Table.', route: '/table', title: 'Table', queries: { files: { query: 'pdf.files.list' } },
        view: {
          type: 'table', entity: 'pdf.file', data: '$query.files.items', columns: [{ label: 'Name', field: 'name' }],
          onRowClick: { navigate: '/files/{{ $item.id }}' },
        },
      });
      ext.registerPage('pdf.list', {
        description: 'List.', route: '/list', title: 'List', queries: { files: { query: 'pdf.files.list' } },
        view: { type: 'list', entity: 'pdf.file', data: '$query.files.items', item: { type: 'text', text: '$item.name' } },
      });
    }))).toEqual([]);
  });
  it('M2.10-E17 $query paths are checked against the declared query’s output', () => {
    expect(errorsOf(recordedIssues((ext) => {
      filesQuery(ext);
      ext.registerQuery('pdf.maybe.list', {
        description: 'Maybe.', input: z.object({}),
        output: z.union([z.object({ id: z.string() }), z.object({ url: z.string() })]),
        handle: async () => ({ id: 'a' }),
      });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home',
        queries: { files: { query: 'pdf.files.list' }, maybe: { query: 'pdf.maybe.list' } },
        view: {
          type: 'stack', children: [
            { type: 'text', text: '$query.files.items.0.id' },
            { type: 'text', text: '$query.files.total' },
            { type: 'text', text: '$query.files.nope' },
            { type: 'text', text: '$query.other.x' },
            { type: 'text', text: '$query.maybe.url' },
          ],
        },
      });
    }))).toEqual([
      {
        path: 'ui.pages.0.view.children.2.text', message: '$query.files.nope does not exist in the result of pdf.files.list',
        hint: 'fields there: items, total',
      },
      {
        path: 'ui.pages.0.view.children.3.text', message: 'no query "other" is declared here',
        hint: 'declared: files, maybe',
      },
    ]);
  });
  it('M2.10-E18 $route and $state paths are checked on pages, never in panels', () => {
    expect(errorsOf(recordedIssues((ext) => {
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/files/:fileId', title: 'Home', params: { q: 'string' }, state: { mode: 'list' },
        view: {
          type: 'stack', children: [
            { type: 'text', text: '$route.fileId' },
            { type: 'text', text: '$route.q' },
            { type: 'text', text: '$route.x' },
            { type: 'text', text: '$state.mode' },
            { type: 'text', text: '$state.other' },
            { type: 'button', label: 'Save', onClick: { set: { '$state.other': 1 } } },
          ],
        },
      });
      ext.registerPanel('pdf.tip', { description: 'Tip.', slot: 'frame.overlay', view: { type: 'text', text: '$route.x' } });
    }))).toEqual([
      {
        path: 'ui.pages.0.view.children.2.text', message: '$route.x does not exist in the route and params of pdf.home',
        hint: 'fields there: fileId, q',
      },
      {
        path: 'ui.pages.0.view.children.4.text', message: '$state.other does not exist in the state of pdf.home',
        hint: 'fields there: mode',
      },
      {
        path: 'ui.pages.0.view.children.5.onClick.set.$state.other',
        message: '$state.other does not exist in the state of pdf.home', hint: 'fields there: mode',
      },
    ]);
  });
  it('M2.10-E19 command payloads check literals against the input; bindings and forms pass', () => {
    expect(errorsOf(checkedIssues((ext) => {
      ext.registerCommand('pdf.translate', {
        description: 'Translates.', input: z.strictObject({ fileId: z.string(), lang: z.enum(['en', 'ar']) }), handle,
      });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home',
        view: {
          type: 'stack', children: [
            { type: 'button', label: 'Fr', onClick: { command: 'pdf.translate', payload: { fileId: '$item.id', lang: 'fr' } } },
            { type: 'button', label: 'One', onClick: { command: 'pdf.translate', payload: { fileId: 1, lang: 'ar' } } },
            { type: 'button', label: 'Extra', onClick: { command: 'pdf.translate', payload: { fileId: '$item.id', lang: 'ar', extra: 1 } } },
            { type: 'button', label: 'Missing', onClick: { command: 'pdf.translate', payload: { fileId: '$item.id' } } },
            { type: 'button', label: 'Form', onClick: { command: 'pdf.translate', payload: { fileId: '$item.id' }, form: true } },
            { type: 'button', label: 'Bound', onClick: { command: 'pdf.translate', payload: { fileId: '{{ $item.id }}', lang: 'en' } } },
          ],
        },
      });
    }))).toEqual([
      {
        path: 'ui.pages.0.view.children.0.onClick.payload.lang',
        message: 'must be equal to one of the allowed values',
      },
      { path: 'ui.pages.0.view.children.1.onClick.payload.fileId', message: 'must be string' },
      { path: 'ui.pages.0.view.children.2.onClick.payload.extra', message: 'must NOT have additional properties' },
      { path: 'ui.pages.0.view.children.3.onClick.payload.lang', message: 'must have required property \'lang\'' },
    ]);
  });
  it('M2.10-E20 component props check literals; bindings pass', () => {
    expect(errorsOf(checkedIssues((ext) => {
      ext.registerTranslations({ default: 'en', catalogs: { en: { card: { title: 'Card' } } } });
      ext.registerComponent('pdf.fileCard', {
        description: 'Card.',
        props: z.strictObject({ title: z.text(), count: z.number(), onOpen: z.action().optional() }),
        view: { type: 'text', text: '$props.title' },
      });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/home', title: 'Home',
        view: {
          type: 'stack', children: [
            { type: 'pdf.fileCard', count: 2 },
            { type: 'pdf.fileCard', title: 'Hi', count: 'many' },
            { type: 'pdf.fileCard', title: 'Hi', count: 2, extra: 1 },
            { type: 'pdf.fileCard', title: '$t.card.title', count: '$item.pages', onOpen: { navigate: '/files' } },
          ],
        },
      });
    }))).toEqual([
      { path: 'ui.pages.0.view.children.0.title', message: 'must have required property \'title\'' },
      { path: 'ui.pages.0.view.children.1.count', message: 'must be number' },
      { path: 'ui.pages.0.view.children.2.extra', message: 'must NOT have additional properties' },
    ]);
  });
  it('M2.10-E21 slot props check literals; bindings pass', () => {
    expect(errorsOf(checkedIssues((ext) => {
      ext.registerSlot('pdf.tray', { description: 'Tray.', accepts: ['panel'], props: z.object({ fileId: z.string() }) });
      ext.registerPage('pdf.home', {
        description: 'Home.', route: '/files/:fileId', title: 'Home',
        view: {
          type: 'stack', children: [
            { type: 'slot', name: 'pdf.tray', props: { fileId: 3 } },
            { type: 'slot', name: 'pdf.tray', props: { fileId: '$route.fileId' } },
          ],
        },
      });
    }))).toEqual([{ path: 'ui.pages.0.view.children.0.props.fileId', message: 'must be string' }]);
  });
});
