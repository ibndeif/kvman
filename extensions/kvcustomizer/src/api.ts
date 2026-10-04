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
  }
  interface Queries {
    'kvcustomizer.ext.list': { input: Empty; output: { folder: string; name: string; namespace: string; version: string }[] };
    'kvcustomizer.preview.status': { input: Empty; output: PreviewStatus };
    'kvcustomizer.guides.list': { input: Empty; output: { pages: Guide[]; problems: { extension: string; problem: { code: string; message: string; params?: Record<string, unknown> } }[] } };
    'kvcustomizer.guides.get': { input: { extension?: string; topic: string }; output: Guide & { markdown: string } };
    'kvcustomizer.docs.list': { input: Empty; output: { topic: string; title: string }[] };
    'kvcustomizer.docs.get': { input: { topic: string }; output: Page };
  }
}
