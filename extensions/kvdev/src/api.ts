// kvdev's public names for typed calls (plan 03 §3.2): a caller gets them after `import type {} from '@kvman/kvdev'`.

type Empty = Record<string, never>;
type Finding = { file?: string; message: string; hint: string };
type Folder = { folder: string };
type DocTopic = 'sdk' | 'views' | 'components' | 'i18n' | 'connectors' | 'presets';
type PreviewStatus = { running: false } | { running: true; url: string; extensions: string[]; startedAt: string };

declare module '@kvman/sdk' {
  interface Commands {
    'kvdev.ext.new': { input: { name: string; namespace: string; folder: string; web?: boolean }; output: { folder: string; name: string; namespace: string; web: boolean } };
    'kvdev.ext.check': { input: Folder; output: Finding[] };
    'kvdev.ext.test': { input: Folder; output: { passed: boolean; exitCode: number; output: string } };
    'kvdev.preset.new': { input: { name: string; file: string }; output: { file: string } };
    'kvdev.preset.check': { input: { file: string }; output: { file: string; message: string; hint: string }[] };
    'kvdev.preview.start': { input: { extensions: string[]; preset?: string }; output: { url: string } };
    'kvdev.preview.stop': { input: Empty; output: Empty };
  }
  interface Queries {
    'kvdev.ext.list': { input: Empty; output: { folder: string; name: string; namespace: string; version: string }[] };
    'kvdev.preview.status': { input: Empty; output: PreviewStatus };
    'kvdev.docs.get': { input: { topic: DocTopic }; output: string };
  }
}
