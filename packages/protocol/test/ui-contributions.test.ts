import { describe, expect, it } from 'vitest';
import {
  actionDefSchema, compositeDefSchema, manifestSchema, navGroupDefSchema, navItemDefSchema, panelDefSchema, presetSchema, rendererDefSchema,
  rendererTargetDefSchema, settingsSectionDefSchema, slotDefSchema, statusItemDefSchema, toolbarItemDefSchema, widgetDefSchema,
} from '../src/index.ts';
import { copyOf, expectRoundTrip, issuePaths } from './assertions.ts';
import kioskPresetFixture from './fixtures/kiosk-preset.json' with { type: 'json' };
import pdfManifestFixture from './fixtures/pdf-manifest.json' with { type: 'json' };

const description = 'A test contribution.';
const objectSchema = { type: 'object', properties: { sessionId: { type: 'string' } }, required: ['sessionId'] };

describe('contributions (plan 08 §8.4–§8.5, §8.9)', () => {
  it('M0.4-E18 every contribution shape validates', () => {
    expectRoundTrip(navGroupDefSchema, { description, label: '$t.nav.documents', icon: 'folder', order: 200 });
    expectRoundTrip(navItemDefSchema, { description, page: 'pdf.files', group: 'pdf.documents', label: '$t.nav.files', icon: 'files',
      badge: { query: 'pdf.files.count', payload: { status: 'translating' }, field: 'count', refreshOn: ['pdf.*'] } });
    expectRoundTrip(toolbarItemDefSchema, { description, slot: 'frame.topbar.end', as: 'button', label: '$t.toolbar.upload', icon: 'upload',
      action: { navigate: '/files?upload=1' } });
    expectRoundTrip(toolbarItemDefSchema, { description, slot: 'agent.chat.header', as: 'menu', label: '$t.more',
      items: [{ label: '$t.export', action: { command: 'pdf.export', payload: { sessionId: '$slot.sessionId' } } }] });
    expectRoundTrip(toolbarItemDefSchema, { description, slot: 'frame.topbar.end', as: 'badge', label: '$t.queue',
      badge: { query: 'pdf.files.count', field: 'count' } });
    expect(issuePaths(toolbarItemDefSchema, { description, slot: 'frame.topbar.end', as: 'button', label: '$t.x' })).toEqual(['action']);
    expectRoundTrip(statusItemDefSchema, { description, side: 'end', icon: 'loader', tone: 'info', label: { $t: 'status.translating', count: '$query.q.count' },
      queries: { q: { query: 'pdf.files.count', payload: { status: 'translating' }, refreshOn: ['pdf.*'] } },
      visibleIf: { '$query.q.count': { gt: 0 } }, action: { navigate: '/files' } });
    expectRoundTrip(panelDefSchema, { description, slot: 'agent.chat.prompt',
      queries: { open: { query: 'interviewer.questions.list', payload: { sessionId: '$slot.sessionId', status: 'open' } } },
      visibleIf: { '$query.open.items.0': { exists: true } }, view: { type: 'interviewer.questionCard', question: '$query.open.items.0' } });
    expectRoundTrip(actionDefSchema, { description, entity: 'pdf.file', label: '$t.actions.translate', command: 'pdf.translate',
      payload: { fileId: '$item.id' }, form: true, visibleIf: { '$item.status': { in: ['ready', 'translated'] } } });
    expectRoundTrip(actionDefSchema, { description, entity: 'pdf.file', label: '$t.open', navigate: '/files/{{ $item.id }}', pane: 'side' });
    expectRoundTrip(actionDefSchema, { description, entity: 'pdf.file', label: '$t.details', placement: ['row'],
      openDialog: { title: '$t.details', view: { type: 'json', value: '$item' } } });
    expectRoundTrip(rendererDefSchema, { description, target: 'mime:application/pdf', component: 'pdf.viewer', props: { blobId: '$item.blobId' } });
    expectRoundTrip(slotDefSchema, { description, accepts: ['panel'], props: objectSchema, layout: 'stack' });
    expectRoundTrip(rendererTargetDefSchema, { description, item: objectSchema });
    expectRoundTrip(compositeDefSchema, { description, props: objectSchema, visibility: 'public', children: 'any',
      view: { type: 'card', children: [{ type: 'heading', text: '$props.title' }, { type: 'children' }] } });
    expectRoundTrip(widgetDefSchema, { description, props: objectSchema, widget: 'widgets/viewer.html', visibility: 'private' });
    expectRoundTrip(settingsSectionDefSchema, { description, view: { type: 'settingsSections', filter: 'settings.section.pdf' } });
  });

  it('M0.4-E19 the pdf manifest validates with its UI fully typed', () => {
    expectRoundTrip(manifestSchema, pdfManifestFixture);
    const manifest = copyOf(pdfManifestFixture);
    manifest.ui.pages[0]?.view.children.push({ type: 'tab', id: 'x', label: '$t.x' } as never);
    expect(issuePaths(manifestSchema, manifest)).toEqual(['ui.pages.0.view.children.3']);
  });

  it('M0.4-E20 preset pages and nav are typed', () => {
    expectRoundTrip(presetSchema, kioskPresetFixture);
    const preset = copyOf(kioskPresetFixture);
    Object.assign(preset.pages[0]?.view ?? {}, { type: 'carousel' });
    expect(issuePaths(presetSchema, preset)).toEqual(['pages.0.view.type']);
  });
});
