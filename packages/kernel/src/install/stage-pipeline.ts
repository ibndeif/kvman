import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { manifestSchema, type Issue, type Json } from '@kvman/protocol';
import { validateManifest } from '../validation/manifest-validation.ts';
import type { KernelEvents } from '../validation/reference-rules.ts';
import { InstallFailure, sourceInvalid } from './install-failure.ts';
import type { StagingArea } from './install-paths.ts';
import type { InstallLoader } from './loader-process.ts';
import { scanImports } from './import-scan.ts';
import { nativeCodeWarning } from './native-code.ts';
import { checkPackage, readPackageJson } from './package-checks.ts';
import { buildFileList, snapshotDigest } from './snapshot-files.ts';
import type { ResolvedSource, StagingFolders } from './sources.ts';
import type { StagedVersion } from './stage-summary.ts';

export type StageTools = {
  area: StagingArea;
  loader: InstallLoader;
  sdkVersion: string;
  kernelEvents: KernelEvents;
  correlationId: string;
};

function manifestIssues(candidate: Json, tools: StageTools): { errors: Issue[]; warnings: Issue[] } {
  const issues = validateManifest(candidate, { kernelEvents: tools.kernelEvents });
  return { errors: issues.filter((issue) => issue.severity !== 'warning'), warnings: issues.filter((issue) => issue.severity === 'warning') };
}

// 06 §6.2 steps 1–5 for one source: resolve it into a fresh staging tree, check the package, scan its imports, build
// the file list and digest, record setup in the sandboxed loader, and validate the manifest again. Any failure
// deletes the staging tree.
export async function stageTree(source: string, resolve: (folders: StagingFolders) => Promise<ResolvedSource>, tools: StageTools): Promise<StagedVersion> {
  const root = await tools.area.create();
  const folders: StagingFolders = { tree: join(root, 'tree'), work: join(root, 'work') };
  try {
    await mkdir(folders.tree);
    await mkdir(folders.work);
    const resolved = await resolve(folders);
    await rm(folders.work, { recursive: true, force: true });
    const packageFolder = join(folders.tree, 'node_modules', resolved.name);
    const packageJson = await readPackageJson(packageFolder);
    const checked = await checkPackage(packageFolder, packageJson, tools.sdkVersion);
    if (checked.name !== resolved.name) throw sourceInvalid(`the package is named ${checked.name}, not ${resolved.name}`);
    const importWarnings = await scanImports(packageFolder, packageJson);
    const fileList = await buildFileList(folders.tree);
    const digest = snapshotDigest(fileList);
    if (resolved.expected !== undefined && resolved.expected.digest !== digest) throw sourceInvalid(resolved.expected.mismatch);
    const request = { entry: join(packageFolder, checked.main), packageName: checked.name, version: checked.version, correlationId: tools.correlationId };
    const candidate = await tools.loader.record(request, folders.tree);
    const { errors, warnings } = manifestIssues(candidate, tools);
    const [first] = errors;
    if (first !== undefined) throw new InstallFailure('EXT_MANIFEST_INVALID', { detail: first.message, issues: errors });
    const native = nativeCodeWarning(fileList);
    return {
      tree: folders.tree, source, digest, manifest: manifestSchema.parse(candidate), warnings: [...(native === undefined ? [] : [native]), ...importWarnings, ...warnings],
      ...(resolved.integrity === undefined ? {} : { integrity: resolved.integrity }),
    };
  } catch (error) {
    await tools.area.remove(root);
    throw error;
  }
}
