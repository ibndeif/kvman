import type { KernelQueries } from '@kvman/sdk';

// kvbuilder's public names for typed calls (plan 03 §3.2): a caller gets them after `import type {} from '@kvman/kvbuilder'`.

type Empty = Record<string, never>;
type Finding = { file?: string; message: string; hint: string };
type Folder = { folder: string };
type Guide = { extension: string; topic: string; title: string };
type Page = { topic: string; title: string; markdown: string };
type PreviewCall = { name: string; input?: Record<string, unknown> };
type PreviewAnswer = { ok: true; output: unknown } | { ok: false; problem: { code: string; message: string; params?: Record<string, unknown> } };
type PreviewStatus = { running: false } | { running: true; url: string; extensions: string[]; startedAt: string };

declare module '@kvman/sdk' {
  interface Commands {
    'kvbuilder.ext.new': { input: { name: string; namespace: string; folder: string; web?: boolean }; output: { folder: string; name: string; namespace: string; web: boolean } };
    'kvbuilder.ext.check': { input: Folder; output: Finding[] };
    'kvbuilder.ext.test': { input: Folder; output: { passed: boolean; exitCode: number; output: string } };
    'kvbuilder.preset.new': { input: { name: string; file: string }; output: { file: string } };
    'kvbuilder.preset.check': { input: { file: string }; output: { file: string; message: string; hint: string }[] };
    'kvbuilder.preview.start': { input: { extensions: string[]; preset?: string }; output: { url: string } };
    'kvbuilder.preview.stop': { input: Empty; output: Empty };
    'kvbuilder.preview.command.run': { input: PreviewCall; output: PreviewAnswer };
    'kvbuilder.app.model.set': { input: { model: string }; output: Empty };
    'kvbuilder.app.settings.set': { input: { key: string; value: unknown; scope: 'global' | 'workspace' }; output: Empty };
    'kvbuilder.app.settings.reset': { input: { key: string; scope: 'global' | 'workspace' }; output: Empty };
    'kvbuilder.app.extensions.install': { input: { source: string }; output: { file: string; restartRequired: true } };
    'kvbuilder.app.restart': { input: Empty; output: { restarting: true } };
    'kvbuilder.app.extensions.uninstall': { input: { name: string }; output: { file: string; restartRequired: true } };
  }
  interface Queries {
    'kvbuilder.ext.list': { input: Empty; output: { folder: string; name: string; namespace: string; version: string }[] };
    'kvbuilder.preview.status': { input: Empty; output: PreviewStatus };
    'kvbuilder.preview.query.get': { input: PreviewCall; output: PreviewAnswer };
    'kvbuilder.app.model.list': { input: Empty; output: { id: string; name: string; provider: string; isDefault: boolean }[] };
    'kvbuilder.app.settings.list': { input: Empty; output: { key: string; description: string; scopes: ('global' | 'workspace')[]; value: unknown; source: string }[] };
    'kvbuilder.app.extensions.list': { input: Empty; output: { name: string; version: string; source: string; namespace: string; commands: string[]; queries: string[]; settings: string[] }[] };
    'kvbuilder.app.preset.get': { input: Empty; output: { name: string; origin: 'bundled' | 'home' | 'file'; file?: string; extensions: Record<string, string>; settings?: Record<string, unknown> } };
    'kvbuilder.app.workspaces.list': KernelQueries['kernel.workspace.list'];
    'kvbuilder.app.jobs.list': KernelQueries['kernel.jobs.list'];
    'kvbuilder.app.jobs.get': KernelQueries['kernel.jobs.get'];
    'kvbuilder.app.processes.list': KernelQueries['kernel.processes.list'];
    'kvbuilder.app.health.get': KernelQueries['kernel.health.get'];
    'kvbuilder.app.query.get': { input: { name: string; input?: Record<string, unknown> }; output: unknown };
    'kvbuilder.app.guide.get': { input: Empty; output: { instructions: string } };
    'kvbuilder.guides.list': { input: Empty; output: { pages: Guide[]; problems: { extension: string; problem: { code: string; message: string; params?: Record<string, unknown> } }[] } };
    'kvbuilder.guides.get': { input: { extension?: string; topic: string }; output: Guide & { markdown: string } };
    'kvbuilder.docs.list': { input: Empty; output: { topic: string; title: string }[] };
    'kvbuilder.docs.get': { input: { topic: string }; output: Page };
  }
}
