import { describe, expect, it } from 'vitest';
import {
  preferencesGetRequestSchema, preferencesSetRequestSchema, uiGetRequestSchema, uiPageAnswerSchema, uiPageGetRequestSchema,
  uiRegistrySchema, uiTranslationsAnswerSchema, uiTranslationsGetRequestSchema, userPreferencesSchema,
} from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

const workspaceId = 'a'.repeat(64);

function registry() {
  return {
    workspaceId,
    revision: 'etag-1',
    app: { title: '$t.app.title', icon: 'languages', accent: '#2563EB', themeMode: 'system', home: '/board' },
    layout: { sidebar: 'expanded', statusbar: 'shown' },
    slots: {
      'frame.sidebar': {
        owner: 'frame', accepts: ['navGroup', 'navItem', 'separator'],
        items: [{ id: 'board.nav-top', owner: '@acme/board', kind: 'navItem', def: { page: 'board.home' }, label: 'Top' }],
      },
    },
    pages: [{
      id: 'board.home', owner: '@acme/board', route: '/board', title: '$t.board.title', icon: 'files', hidden: false,
      label: { en: 'Top', ar: 'الأعلى' },
    }],
    actions: {},
    renderers: {},
    components: [{
      name: 'board.card', owner: '@acme/board', form: 'composite', visibility: 'public',
      def: { description: 'A card.', props: { type: 'object' }, view: { type: 'text', text: 'Hi' } },
    }],
    extensions: { '@acme/board': { namespace: 'board', title: '$t.meta.title' } },
    settingsSections: [{
      id: 'settings.section.board', owner: '@acme/board', title: '$t.meta.title', scopes: ['global', 'workspace'],
      schema: { type: 'object' }, label: 'Board settings',
    }],
    catalogs: { defaults: { '@acme/board': 'en' }, locales: ['en', 'ar'] },
  };
}

describe('registry answers and preferences (ADRs 0159, 0161)', () => {
  it('M2.11-E49 labels, composite definitions, answers, and preferences parse; the wrong shapes fail', () => {
    expectRoundTrip(uiRegistrySchema, registry());
    expectRoundTrip(uiGetRequestSchema, { workspaceId });
    expectRoundTrip(uiPageGetRequestSchema, { workspaceId, pageId: 'board.home' });
    expectRoundTrip(uiTranslationsGetRequestSchema, { workspaceId });

    expectRoundTrip(uiPageAnswerSchema, {
      page: { description: 'Home.', route: '/board', title: '$t.board.title', view: { type: 'stack' } },
      components: [{
        name: 'board.frame', owner: '@acme/board',
        def: { description: 'A frame.', props: { type: 'object' }, view: { type: 'text', text: 'Hi' } },
      }],
    });
    expectRoundTrip(uiTranslationsAnswerSchema, {
      locale: 'ar-EG',
      catalogs: { '@acme/board': { ar: { files: { title: 'الملفات' } }, en: { files: { title: 'Files' } } } },
    });
    expectRoundTrip(userPreferencesSchema, { locale: 'en', theme: 'app', desktopAlerts: false });
    expectRoundTrip(preferencesGetRequestSchema, {});
    expectRoundTrip(preferencesSetRequestSchema, { locale: 'en-US', theme: 'dark' });

    const itemPath = 'slots.frame.sidebar.items.0.label';
    expect(issuePaths(uiRegistrySchema, {
      ...registry(),
      slots: {
        'frame.sidebar': {
          owner: 'frame', accepts: ['navItem'],
          items: [{ id: 'board.nav-top', owner: '@acme/board', kind: 'navItem', def: {}, label: 42 }],
        },
      },
    })).toEqual([itemPath]);
    expect(issuePaths(uiRegistrySchema, {
      ...registry(),
      slots: {
        'frame.sidebar': {
          owner: 'frame', accepts: ['navItem'],
          items: [{ id: 'board.nav-top', owner: '@acme/board', kind: 'navItem', def: {}, label: { en: 1 } }],
        },
      },
    })).toEqual([itemPath]);
    expect(issuePaths(uiRegistrySchema, {
      ...registry(),
      components: [{
        name: 'board.viewer', owner: '@acme/board', form: 'widget', visibility: 'private',
        def: { description: 'A viewer.', props: { type: 'object' }, view: { type: 'text', text: 'Hi' } },
      }],
    })).toEqual(['components.0.def']);

    expect(issuePaths(userPreferencesSchema, { locale: 'en', theme: 'blue', desktopAlerts: false })).toEqual(['theme']);
    expect(issuePaths(preferencesSetRequestSchema, { color: 'red' })).toEqual(['']);
  });
});
