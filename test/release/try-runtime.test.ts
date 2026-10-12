import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { layoutOf, npmLauncher, targetOf } from '../../release/desktop/runtime-plan.ts';
import { tryRuntime } from '../../release/desktop/try-runtime.ts';

const target = targetOf(process.platform, process.arch);
const windows = target.startsWith('win');
const cliSource = pathToFileURL(fileURLToPath(new URL('../../packages/cli/src/main.ts', import.meta.url))).href;
// The folders a system has without Node, as the release gives them.
const systemPath = windows ? path.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32') : '/usr/bin:/bin';

const running = (port: string): string => `process.stdout.write(JSON.stringify({ kind: 'running', url: 'http://127.0.0.1:' + ${port} + '/?workspace=home', port: ${port} }) + '\\n');`;

const entries = {
  kvman: `import ${JSON.stringify(cliSource)};`,
  silent: 'process.exit(1);',
  deaf: `${running('1')} process.stdin.resume();`,
  stubborn: `import { createServer } from 'node:http';
const server = createServer((_request, response) => response.end(JSON.stringify({ ok: true, output: {} })));
server.listen(0, '127.0.0.1', () => { ${running('server.address().port')} });
process.stdin.resume();
process.stdin.on('end', () => undefined);`,
};

describe('the run of the bundle with no window (14 §14.8, ADR 0038, 40)', { timeout: 120_000 }, () => {
  const folders: string[] = [];
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  // A runtime folder laid out as the app's: this test's own Node and npm, and the given program as kvman's entry.
  function runtimeWith(entry: string): string {
    const runtime = mkdtempSync(path.join(tmpdir(), 'kvman-fake-runtime-'));
    folders.push(runtime);
    const layout = layoutOf(target);
    const inside = (file: string): string => path.join(runtime, ...file.split('/'));
    const nodeHome = path.dirname(process.execPath);
    mkdirSync(inside(layout.nodeFolder), { recursive: true });
    mkdirSync(path.dirname(inside(layout.npmPackage)), { recursive: true });
    mkdirSync(path.dirname(inside(layout.entry)), { recursive: true });
    if (windows) {
      cpSync(process.execPath, inside(layout.node));
      cpSync(path.join(nodeHome, 'npm.cmd'), inside(layout.npm));
      symlinkSync(path.join(nodeHome, 'node_modules', 'npm'), inside(layout.npmPackage), 'junction');
    } else {
      symlinkSync(process.execPath, inside(layout.node));
      symlinkSync(path.join(nodeHome, '..', 'lib', 'node_modules', 'npm'), inside(layout.npmPackage));
      writeFileSync(inside(layout.npm), npmLauncher, { mode: 0o755 });
    }
    writeFileSync(inside(layout.entry), entry);
    writeFileSync(path.join(path.dirname(path.dirname(inside(layout.entry))), 'package.json'), JSON.stringify({ type: 'module' }));
    return runtime;
  }

  it('M3.3-H1 kvman starts with the bundled Node, answers, and finds the bundled npm with no Node on the PATH', async () => {
    const tried = await tryRuntime({ runtime: runtimeWith(entries.kvman), target, systemPath, environment: { NODE_OPTIONS: '--conditions=@kvman/source' } });
    expect(tried.port).toBeGreaterThan(0);
    expect(tried.npmVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('M3.3-H7 the run fails when kvman writes no running line, does not answer, or does not exit', async () => {
    await expect(tryRuntime({ runtime: runtimeWith(entries.silent), target, systemPath })).rejects.toThrow('kvman wrote no running line.');
    await expect(tryRuntime({ runtime: runtimeWith(entries.deaf), target, systemPath })).rejects.toThrow('kernel.health.get did not answer on port 1.');
    await expect(tryRuntime({ runtime: runtimeWith(entries.stubborn), target, systemPath, waitMs: 1500 })).rejects.toThrow('kvman did not exit after its input closed.');
  });
});
