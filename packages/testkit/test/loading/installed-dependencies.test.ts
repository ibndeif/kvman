import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { createTestKernel, type TestKernel } from '../../src/index.ts';
import { baseExtension, installedExtensions, install, useDependencyProjects } from '../support/dependency-projects.ts';

const projects = useDependencyProjects();
const kernels: TestKernel[] = [];
afterEach(async () => {
  for (const kernel of kernels.splice(0)) await kernel.close();
});

async function start(extensions: string[]): Promise<TestKernel> {
  const kernel = await createTestKernel({ extensions, logLevel: 'warn' });
  kernels.push(kernel);
  return kernel;
}

const invalid = (message: RegExp) => expect.objectContaining({ problem: expect.objectContaining({ code: 'EXTENSION_INVALID', message: expect.stringMatching(message) }) });

describe("a test kernel loads a project's installed dependencies (10, ADR 0080, 4)", () => {
  it('QA51-H6 the declared dependencies, and theirs, load from node_modules by main, and the project calls them', async () => {
    const kernel = await start([projects.project({ '@test/base': '^0.1.0' }, installedExtensions)]);
    const loaded = (await kernel.exec('kernel.extensions.list', {})).map((extension) => ({ name: extension.name, source: extension.source }));
    expect(loaded).toEqual(expect.arrayContaining([{ name: '@test/root', source: 'bundled' }, { name: '@test/base', source: 'bundled' }, { name: 'notes', source: expect.stringMatching(/^path:/) }]));
    expect(loaded).toHaveLength(3);
    expect(await kernel.exec('notes.base.get', {})).toEqual({ where: 'installed' });
    expect(z.object({ value: z.string() }).parse(await kernel.exec('root.value.get', {}))).toEqual({ value: 'root' });
  });

  it("QA51-E4 a dependency that is not installed is the kernel's own failure", async () => {
    await expect(start([projects.project({ '@test/missing': '^0.1.0' }, [])])).rejects.toEqual(invalid(/notes depends on @test\/missing, which is not in this run/));
  });

  it('QA51-E6 a folder named in extensions wins over the installed copy', async () => {
    const project = projects.project({ '@test/base': '^0.1.0' }, installedExtensions);
    const kernel = await start([project, projects.baseFolder(project)]);
    expect(await kernel.exec('notes.base.get', {})).toEqual({ where: 'folder' });
    const base = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@test/base');
    expect(base?.source).toMatch(/^path:/);
  });

  it("QA51-E7 an installed dependency out of range is the kernel's own failure", async () => {
    const project = projects.project({ '@test/base': '^0.1.0' }, installedExtensions.filter((extension) => extension.name !== '@test/base'));
    install(project, { ...baseExtension, version: '2.0.0' });
    await expect(start([project])).rejects.toEqual(invalid(/needs @test\/base \^0\.1\.0, but the run has 2\.0\.0/));
  });
});
