import { canonicalJson, jsonSchema, type Json } from '@kvman/protocol';
import { z } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import fixture from '../../../protocol/test/fixtures/pdf-manifest.json' with { type: 'json' };
import { recordedIssues } from '../validation/harness.ts';
import { record } from './harness.ts';
import { pdfUiExtension } from './pdf-ui-extension.ts';

const losslessHint = 'keep schemas to what JSON Schema expresses; convert values in the handler instead';

describe('recording UI registrations (plan 05 §5.3, 08 §8.5, §8.9, ADR 0156)', () => {
  it('M2.10-H7 the pdf example UI records the M0.3 fixture ui exactly', () => {
    const { manifest } = record(pdfUiExtension.setup);
    const expected: Json = fixture.ui;
    expect(canonicalJson(jsonSchema.parse(manifest.ui))).toBe(canonicalJson(expected));
  });

  it('M2.10-E1 one call of each UI register method lands in its ui array', () => {
    const { manifest } = record((ext) => {
      ext.registerConfig({ scope: 'global', schema: z.object({ name: z.string().describe('Name.') }) });
      ext.registerPage('pdf.home', { description: 'Home.', route: '/home', title: 'Home', view: { type: 'stack' } });
      ext.registerNavGroup('pdf.docs', { description: 'Docs.', label: 'Docs' });
      ext.registerNavItem('pdf.nav-home', { description: 'Home item.', page: 'pdf.home', label: 'Home', icon: 'home' });
      ext.registerToolbarItem('pdf.upload', {
        description: 'Upload.', slot: 'frame.topbar.end', as: 'button', label: 'Upload', action: { navigate: '/home' },
      });
      ext.registerStatusItem('pdf.queue', { description: 'Queue.', label: 'Queue' });
      ext.registerPanel('pdf.tip', { description: 'Tip.', slot: 'frame.overlay', view: { type: 'stack' } });
      ext.registerSlot('pdf.tray', { description: 'Tray.', accepts: ['panel'], props: z.object({ itemId: z.string() }) });
      ext.registerEntity('pdf.file', {
        description: 'A file.', title: 'File', schema: z.object({ id: z.string() }), idField: 'id', display: { title: '$item.id' },
      });
      ext.registerAction('pdf.inspect', {
        description: 'Inspect.', entity: 'pdf.file', label: 'Inspect', navigate: '/home',
      });
      ext.registerRendererTarget('pdf.entry', {
        description: 'Entry.', item: z.object({ id: z.string(), text: z.string() }),
      });
      ext.registerRenderer('pdf.preview', {
        description: 'Preview.', target: 'mime:application/pdf', component: 'pdf.viewer', props: { blobId: '$item.blobId' },
      });
      ext.registerComponent('pdf.card', {
        description: 'Card.', props: z.object({ title: z.string() }), view: { type: 'heading', text: '$props.title' },
      });
      ext.registerComponent('pdf.viewer', {
        description: 'Viewer.', props: z.object({ blobId: z.string() }), widget: 'widgets/viewer.html',
      });
      ext.registerSettingsSection({ description: 'Settings.', view: { type: 'stack' } });
    });
    expect(manifest.ui.pages).toEqual([
      { id: 'pdf.home', description: 'Home.', route: '/home', title: 'Home', view: { type: 'stack' } },
    ]);
    expect(manifest.ui.navGroups).toEqual([{ id: 'pdf.docs', description: 'Docs.', label: 'Docs' }]);
    expect(manifest.ui.navItems).toEqual([
      { id: 'pdf.nav-home', description: 'Home item.', page: 'pdf.home', label: 'Home', icon: 'home' },
    ]);
    expect(manifest.ui.toolbarItems).toEqual([
      {
        id: 'pdf.upload', description: 'Upload.', slot: 'frame.topbar.end', as: 'button', label: 'Upload',
        action: { navigate: '/home' },
      },
    ]);
    expect(manifest.ui.statusItems).toEqual([{ id: 'pdf.queue', description: 'Queue.', label: 'Queue' }]);
    expect(manifest.ui.panels).toEqual([
      { id: 'pdf.tip', description: 'Tip.', slot: 'frame.overlay', view: { type: 'stack' } },
    ]);
    expect(manifest.ui.slots).toEqual([
      {
        id: 'pdf.tray', description: 'Tray.', accepts: ['panel'],
        props: {
          $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
          properties: { itemId: { type: 'string' } }, required: ['itemId'],
        },
      },
    ]);
    expect(manifest.ui.actions).toEqual([
      { id: 'pdf.inspect', description: 'Inspect.', entity: 'pdf.file', label: 'Inspect', navigate: '/home' },
    ]);
    expect(manifest.ui.rendererTargets).toEqual([
      {
        id: 'pdf.entry', description: 'Entry.',
        item: {
          $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
          properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'],
          additionalProperties: false,
        },
      },
    ]);
    expect(manifest.ui.renderers).toEqual([
      {
        id: 'pdf.preview', description: 'Preview.', target: 'mime:application/pdf', component: 'pdf.viewer',
        props: { blobId: '$item.blobId' },
      },
    ]);
    expect(manifest.ui.components).toEqual([
      {
        id: 'pdf.card', description: 'Card.',
        props: {
          $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
          properties: { title: { type: 'string' } }, required: ['title'],
        },
        view: { type: 'heading', text: '$props.title' },
      },
      {
        id: 'pdf.viewer', description: 'Viewer.',
        props: {
          $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object',
          properties: { blobId: { type: 'string' } }, required: ['blobId'],
        },
        widget: 'widgets/viewer.html',
      },
    ]);
    expect(manifest.ui.settingsSection).toEqual({ description: 'Settings.', view: { type: 'stack' } });

    expect(recordedIssues((ext) => {
      ext.registerConfig({ scope: 'global', schema: z.object({ name: z.string().describe('Name.') }) });
      ext.registerSettingsSection({ description: 'First.', view: { type: 'stack' } });
      ext.registerSettingsSection({ description: 'Second.', view: { type: 'stack' } });
    })).toEqual([
      {
        path: 'ui.settingsSection', message: 'registerSettingsSection is already called; it is called at most once',
        hint: 'call registerSettingsSection once',
      },
    ]);
  });

  it('M2.10-E2 a flat Zod params object records as a map; anything else fails', () => {
    const { manifest } = record((ext) => {
      ext.registerPage('pdf.detail', {
        description: 'Detail.', route: '/files/:fileId', title: 'Detail',
        params: z.object({ fileId: z.string(), page: z.number().optional(), raw: z.boolean() }),
        view: { type: 'stack' },
      });
    });
    expect(manifest.ui.pages).toHaveLength(1);
    expect(manifest.ui.pages[0]).toMatchObject({ params: { fileId: 'string', page: 'number', raw: 'boolean' } });

    expect(recordedIssues((ext) => {
      ext.registerPage('pdf.detail', {
        description: 'Detail.', route: '/files/:fileId', title: 'Detail',
        params: z.object({ filter: z.object({ query: z.string() }) }),
        view: { type: 'stack' },
      });
    })).toEqual([
      {
        path: 'ui.pages.0.params', message: 'page params are an object of string, number, or boolean fields',
        hint: 'declare route and search params as flat string, number, or boolean fields',
      },
    ]);
  });

  it('M2.10-E3 a short UI name, a duplicate UI name, and a lossy component schema fail', () => {
    expect(recordedIssues((ext) => {
      ext.registerPage('files', { description: 'Files.', route: '/files', title: 'Files', view: { type: 'stack' } });
    })).toEqual([
      { path: 'ui.pages.0.id', message: 'public names start with the namespace "pdf."', hint: 'did you mean "pdf.files"?' },
    ]);

    expect(recordedIssues((ext) => {
      ext.registerPage('pdf.files', { description: 'Files.', route: '/files', title: 'Files', view: { type: 'stack' } });
      ext.registerNavItem('pdf.files', { description: 'Item.', page: 'pdf.files', label: 'Files', icon: 'files' });
    })).toEqual([
      { path: 'ui.navItems.0.id', message: '"pdf.files" is already registered as a page', hint: 'rename one of them' },
    ]);

    const issues = recordedIssues((ext) => {
      ext.registerComponent('pdf.card', {
        description: 'Card.',
        props: z.object({ label: z.string().transform((value) => value.length) }),
        view: { type: 'heading', text: '$props.label' },
      });
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ path: 'ui.components.0.props', hint: losslessHint });
    expect(issues[0]?.message).toMatch(/^the schema cannot be written as JSON Schema: /);
  });
});
