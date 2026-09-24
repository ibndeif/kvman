import { describe, expect, it } from 'vitest';
import { frameSlots, notificationSchema, noticeActionSchema, toastSchema, uiRegistrySchema } from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const item = { id: 'pdf.nav-files', owner: '@acme/pdf', kind: 'navItem', def: { page: 'pdf.files', label: '$t.nav.files', icon: 'files' } };

const registry = {
  workspaceId: 'a'.repeat(64),
  revision: 'etag-1',
  app: { title: '$t.app.title', icon: 'languages', accent: '#2563EB', themeMode: 'system', home: '/files' },
  layout: { sidebar: 'collapsed', statusbar: 'shown' },
  slots: {
    'frame.sidebar': { owner: 'frame', accepts: ['navGroup', 'navItem', 'separator'], items: [item] },
    'agent.chat.header': { owner: '@kvman/agent', accepts: ['toolbarItem'], layout: 'row', max: 4, items: [] },
  },
  pages: [{ id: 'pdf.files', owner: '@acme/pdf', route: '/files', title: '$t.files.title', icon: 'files', hidden: false }],
  actions: { 'pdf.file': [{ id: 'pdf.translate', owner: '@acme/pdf', kind: 'action', def: { command: 'pdf.translate' } }] },
  renderers: { 'mime:application/pdf': [{ id: 'pdf.preview', owner: '@acme/pdf', kind: 'renderer', def: { component: 'pdf.viewer' } }] },
  components: [{ name: 'pdf.fileCard', owner: '@acme/pdf', form: 'composite', visibility: 'public' }],
  extensions: { '@acme/pdf': { namespace: 'pdf', title: '$t.meta.title', icon: 'file-text' } },
  settingsSections: [{ id: 'settings.section.pdf', owner: '@acme/pdf', title: '$t.meta.title', scopes: ['workspace'], schema: { type: 'object' } }],
  catalogs: { defaults: { '@acme/pdf': 'en' }, locales: ['en', 'ar'] },
};

describe('registry, frame, notifications (plan 08 §8.3, §8.6, §8.11)', () => {
  it('M0.4-E21 the frame slot catalog matches 08 §8.3', () => {
    expect(frameSlots.map(({ name, accepts, max }) => ({ name, accepts, max }))).toEqual([
      { name: 'frame.sidebar', accepts: ['navGroup', 'navItem', 'separator'], max: undefined },
      { name: 'frame.topbar.start', accepts: ['toolbarItem'], max: 3 },
      { name: 'frame.topbar.end', accepts: ['toolbarItem'], max: 4 },
      { name: 'frame.main', accepts: ['page'], max: 2 },
      { name: 'frame.statusbar.start', accepts: ['statusItem'], max: 6 },
      { name: 'frame.statusbar.end', accepts: ['statusItem'], max: 6 },
      { name: 'frame.overlay', accepts: ['panel'], max: 1 },
    ]);
  });

  it('M0.4-E22 the UI registry round-trips', () => {
    expectRoundTrip(uiRegistrySchema, registry);
    const { owner: _owner, ...withoutOwner } = item;
    expect(issuePaths(uiRegistrySchema, { ...registry, slots: { 'frame.sidebar': { owner: 'frame', accepts: [], items: [withoutOwner] } } }))
      .toEqual(['slots.frame.sidebar.items.0.owner']);
  });

  it('M0.4-E23 toasts, notifications, and notice actions', () => {
    const open = { label: '$t.actions.open', navigate: '/files/f1' };
    const retry = { label: '$t.actions.retry', command: 'pdf.translate', payload: { fileId: 'f1', lang: 'ar' } };
    expectRoundTrip(noticeActionSchema, open);
    expectRoundTrip(noticeActionSchema, retry);
    expectRoundTrip(toastSchema, { text: { $t: 'toast.translated', name: 'report.pdf' }, level: 'success', key: 'translate:f1', action: open, durationMs: 4000 });
    const notification = {
      title: { $t: 'notify.failed', name: 'report.pdf' }, body: '$t.notify.body', level: 'error', key: 'translate:f1',
      problem: { code: 'pdf/NOT_FOUND', title: 'No such file', retryable: false, correlationId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' },
      route: '/files/f1', entity: { type: 'pdf.file', id: 'f1' }, actions: [open, retry], attention: true, expiresAt: 1_790_000_000_000, global: false,
    };
    expectRoundTrip(notificationSchema, notification);
    expect(issuePaths(notificationSchema, { ...notification, actions: [open, retry, open] })).toEqual(['actions']);
    expect(issuePaths(toastSchema, { text: 'x', level: 'fatal' })).toEqual(['level']);
  });
});
