import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { bundledExtensionNames } from '../../src/dependencies/bundled-extensions.ts';
import { findInstalled } from '../../src/dependencies/installed-dependencies.ts';
import { previewPreset } from '../../src/preview/preview-preset.ts';
import { install, useDependencyProjects } from '../support/dependency-projects.ts';

const projects = useDependencyProjects();
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const noop = 'export default () => {};\n';

describe("the preview's generated preset adds bundled dependencies (09 §9.3, ADR 0080, 5)", () => {
  it('QA51-H8 a bundled dependency is added with the bundled ones its installed copy declares', () => {
    const project = projects.project({ '@kvman/kvbuilder': '^0.3.0' }, []);
    install(project, { name: '@kvman/kvbuilder', namespace: 'kvbuilder', version: '0.3.1', dependencies: { '@kvman/kvai': '^0.1.0', '@kvman/kvcoder': '^0.1.2' }, main: noop });
    install(project, { name: '@kvman/kvcoder', namespace: 'kvcoder', version: '0.1.7', dependencies: { '@kvman/kvai': '^0.1.0', '@kvman/kvwebui': '^0.1.0' }, main: noop });
    expect(previewPreset([{ name: 'notes', folder: project }])).toEqual({
      name: 'preview',
      extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvbuilder': 'bundled', '@kvman/kvcoder': 'bundled', notes: `path:${project}` },
      settings: { 'kvwebui.home': 'kvwebui.extensions' },
    });
  });

  it('QA51-E8 a dependency that is not bundled is not added, and a given preset is used as it is', () => {
    const project = projects.project({ '@acme/other': '^1.0.0', '@kvman/kvcoder': '^0.1.0' }, []);
    expect(previewPreset([{ name: 'notes', folder: project }]).extensions).toEqual({ '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled', notes: `path:${project}` });
    const given = { preset: { name: 'notes-app', extensions: { '@kvman/kvwebui': 'bundled' as const }, settings: { 'kvwebui.home': 'notes.hello' } }, folder: project };
    expect(previewPreset([{ name: 'notes', folder: project }], given)).toEqual({ name: 'notes-app', extensions: { '@kvman/kvwebui': 'bundled', notes: `path:${project}` }, settings: { 'kvwebui.home': 'notes.hello' } });
  });

  it("QA51-E9 the bundled names are the kvman package's dependencies that are extensions", () => {
    const cliFolder = path.join(repositoryRoot, 'packages', 'cli');
    const read = (folder: string): unknown => JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'));
    const cli = z.object({ dependencies: z.record(z.string(), z.string()) }).loose().parse(read(cliFolder));
    const isExtension = (name: string): boolean => {
      const folder = findInstalled(name, cliFolder);
      return folder !== undefined && 'kvman' in z.object({}).loose().parse(read(folder));
    };
    const withKvman = Object.keys(cli.dependencies).filter(isExtension);
    expect([...bundledExtensionNames].sort()).toEqual(withKvman.sort());
  });
});
