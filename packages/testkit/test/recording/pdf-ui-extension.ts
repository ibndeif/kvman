import { defineExtension, z } from '@kvman/sdk';
import fixture from '../../../protocol/test/fixtures/pdf-manifest.json' with { type: 'json' };
import { pdfSetup } from './pdf-extension.ts';

// The pdf example's UI of plan 05 §5.2, written with the UI register* calls. Page views are JSON; only the
// component props are Zod schemas, with z.action() where the manifest holds format 'kvman-action'.
const File = z.object({
  id: z.string(), name: z.string(), blobId: z.blobId(),
  status: z.enum(['importing', 'ready', 'translating', 'translated', 'failed']),
  pages: z.number().int().optional(), translatedBlobId: z.blobId().optional(),
  createdAt: z.number(),
});

export const pdfUiExtension = defineExtension({
  name: '@acme/pdf',
  namespace: 'pdf',
  title: '$t.meta.title',
  summary: '$t.meta.summary',
  icon: 'file-text',
  description: 'Import PDF files and translate them with the configured AI model.',
}, (ext) => {
  pdfSetup(ext);
  ext.registerTranslations(fixture.translations);

  ext.registerPage('pdf.files', {
    'description': 'Uploaded PDF files with their translation status.',
    'route': '/files',
    'title': '$t.files.title',
    'icon': 'files',
    'state': { 'filter': null },
    'queries': {
      'files': {
        'query': 'pdf.files.list',
        'payload': { 'status': '$state.filter' },
        'refreshOn': ['pdf.*'],
      },
    },
    'view': {
      'type': 'stack',
      'children': [
        {
          'type': 'row',
          'children': [
            {
              'type': 'heading',
              'text': { '$t': 'files.count', 'count': '$query.files.items.length' },
            },
            {
              'type': 'select',
              'value': '$state.filter',
              'placeholder': '$t.filter.all',
              'options': [['ready', '$t.status.ready'], ['translated', '$t.status.translated']],
              'onChange': { 'set': { '$state.filter': '$value' } },
            },
          ],
        },
        {
          'type': 'upload',
          'accept': ['application/pdf'],
          'label': '$t.upload.drop',
          'onUpload': {
            'command': 'pdf.import',
            'payload': { 'blobId': '$upload.blobId' },
            'then': [{ 'toast': { '$t': 'toast.imported', 'name': '$upload.name' } }],
          },
        },
        {
          'type': 'table',
          'entity': 'pdf.file',
          'data': '$query.files.items',
          'emptyState': { 'title': '$t.empty.title', 'body': '$t.empty.body' },
          'columns': [
            { 'field': 'name', 'label': '$t.columns.name' },
            { 'field': 'status', 'label': '$t.columns.status', 'as': 'badge' },
            { 'field': 'createdAt', 'label': '$t.columns.added', 'format': 'relative' },
            {
              'label': '$t.columns.progress',
              'as': 'liveText',
              'live': 'pdf.progress.updated:{{ $item.id }}',
              'visibleIf': { '$item.status': 'translating' },
            },
          ],
          'rowActions': 'auto',
          'onRowClick': { 'navigate': '/files/{{ $item.id }}' },
        },
      ],
    },
  });

  ext.registerPage('pdf.file-detail', {
    'description': 'One PDF file with its original and its translation.',
    'route': '/files/:fileId',
    'title': '$t.files.detail',
    'icon': 'file-text',
    'params': { 'fileId': 'string' },
    'queries': {
      'file': {
        'query': 'pdf.file.get',
        'payload': { 'fileId': '$route.fileId' },
        'refreshOn': ['pdf.translated'],
      },
    },
    'view': {
      'type': 'page',
      'title': '$query.file.name',
      'entity': 'pdf.file',
      'record': '$query.file',
      'actions': [
        {
          'type': 'button',
          'label': '$t.actions.back',
          'icon': 'arrow-left',
          'variant': 'ghost',
          'onClick': { 'navigate': '/files' },
        },
      ],
      'children': [
        {
          'type': 'split',
          'children': [
            { 'type': 'pdf.viewer', 'blobId': '$query.file.blobId' },
            {
              'type': 'section',
              'title': '$t.files.translation',
              'children': [
                {
                  'type': 'emptyState',
                  'title': '$t.files.notTranslated',
                  'visibleIf': { '$query.file.translatedBlobId': { 'exists': false } },
                },
                {
                  'type': 'fileLink',
                  'blobId': '$query.file.translatedBlobId',
                  'name': '$query.file.name',
                  'visibleIf': { '$query.file.translatedBlobId': { 'exists': true } },
                },
              ],
            },
          ],
        },
      ],
    },
  });

  ext.registerNavGroup('pdf.documents', {
    'description': 'Document tools in the sidebar.',
    'label': '$t.nav.documents',
    'icon': 'folder',
  });

  ext.registerNavItem('pdf.nav-files', {
    'description': 'Files page in the sidebar.',
    'page': 'pdf.files',
    'group': 'pdf.documents',
    'label': '$t.nav.files',
    'icon': 'files',
  });

  ext.registerStatusItem('pdf.queue', {
    'description': 'Number of translations in progress.',
    'icon': 'loader',
    'queries': {
      'q': {
        'query': 'pdf.files.count',
        'payload': { 'status': 'translating' },
        'refreshOn': ['pdf.*'],
      },
    },
    'visibleIf': { '$query.q.count': { 'gt': 0 } },
    'label': { '$t': 'status.translating', 'count': '$query.q.count' },
    'action': { 'navigate': '/files' },
  });

  ext.registerAction('pdf.translate', {
    'description': 'Translate a PDF from its row menu.',
    'entity': 'pdf.file',
    'label': '$t.actions.translate',
    'icon': 'languages',
    'command': 'pdf.translate',
    'payload': { 'fileId': '$item.id' },
    'form': true,
    'visibleIf': { '$item.status': { 'in': ['ready', 'translated'] } },
  });

  ext.registerRenderer('pdf.preview', {
    'description': 'Shows PDF blobs with the viewer.',
    'target': 'mime:application/pdf',
    'component': 'pdf.viewer',
    'props': { 'blobId': '$item.blobId' },
  });

  ext.registerComponent('pdf.fileCard', {
    description: 'Compact card for one PDF file with its status and an Open button.',
    visibility: 'public',
    props: z.object({ file: File, onOpen: z.action().optional().describe('Runs when Open is clicked') }),
    view: {
      'type': 'card',
      'children': [
        { 'type': 'heading', 'text': '$props.file.name' },
        { 'type': 'badge', 'text': '$props.file.status' },
        {
          'type': 'button',
          'label': '$t.card.open',
          'onClick': '$props.onOpen',
          'visibleIf': { '$props.onOpen': { 'exists': true } },
        },
      ],
    },
  });

  ext.registerComponent('pdf.viewer', {
    description: 'Paged PDF viewer.',
    props: z.object({ blobId: z.blobId() }),
    widget: 'widgets/viewer.html',
  });
});
