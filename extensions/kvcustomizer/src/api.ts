// kvcustomizer's public names for typed calls (plan 03 §3.2): a caller gets them after `import type {} from '@kvman/kvcustomizer'`.

type Empty = Record<string, never>;
type Finding = { file?: string; message: string; hint: string };
type Folder = { folder: string };
type Guide = { extension: string; topic: string; title: string };
type Page = { topic: string; title: string; markdown: string };
type PreviewStatus = { running: false } | { running: true; url: string; extensions: string[]; startedAt: string };

declare module '@kvman/sdk' {
  interface Commands {
    'kvcustomizer.ext.new': { input: { name: string; namespace: string; folder: string; web?: boolean }; output: { folder: string; name: string; namespace: string; web: boolean } };
    'kvcustomizer.ext.check': { input: Folder; output: Finding[] };
    'kvcustomizer.ext.test': { input: Folder; output: { passed: boolean; exitCode: number; output: string } };
    'kvcustomizer.preset.new': { input: { name: string; file: string }; output: { file: string } };
    'kvcustomizer.preset.check': { input: { file: string }; output: { file: string; message: string; hint: string }[] };
    'kvcustomizer.preview.start': { input: { extensions: string[]; preset?: string }; output: { url: string } };
    'kvcustomizer.preview.stop': { input: Empty; output: Empty };
    'kvcustomizer.app.model.set': { input: { model: string }; output: Empty };
    'kvcustomizer.app.settings.set': { input: { key: string; value: unknown; scope: 'global' | 'workspace' }; output: Empty };
    'kvcustomizer.app.settings.reset': { input: { key: string; scope: 'global' | 'workspace' }; output: Empty };
    'kvcustomizer.app.extensions.install': { input: { name: string; source: string }; output: { file: string; restartRequired: true } };
    'kvcustomizer.app.extensions.uninstall': { input: { name: string }; output: { file: string; restartRequired: true } };
  }
  interface Queries {
    'kvcustomizer.ext.list': { input: Empty; output: { folder: string; name: string; namespace: string; version: string }[] };
    'kvcustomizer.preview.status': { input: Empty; output: PreviewStatus };
    'kvcustomizer.app.model.list': { input: Empty; output: { id: string; name: string; provider: string; isDefault: boolean }[] };
    'kvcustomizer.app.settings.list': { input: Empty; output: { key: string; description: string; scopes: ('global' | 'workspace')[]; value: unknown; source: string }[] };
    'kvcustomizer.app.extensions.list': { input: Empty; output: { name: string; version: string; source: string; namespace: string; commands: string[]; queries: string[]; settings: string[] }[] };
    'kvcustomizer.app.preset.get': { input: Empty; output: { name: string; origin: 'bundled' | 'home' | 'file'; file?: string; extensions: Record<string, string>; settings?: Record<string, unknown> } };
    'kvcustomizer.guides.list': { input: Empty; output: { pages: Guide[]; problems: { extension: string; problem: { code: string; message: string; params?: Record<string, unknown> } }[] } };
    'kvcustomizer.guides.get': { input: { extension?: string; topic: string }; output: Guide & { markdown: string } };
    'kvcustomizer.docs.list': { input: Empty; output: { topic: string; title: string }[] };
    'kvcustomizer.docs.get': { input: { topic: string }; output: Page };
  }
}
