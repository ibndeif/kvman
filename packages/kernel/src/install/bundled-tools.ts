import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { sourceInvalid } from './install-failure.ts';

export type Platform = { platform: NodeJS.Platform; arch: string; musl: boolean };

function glibcRuntime(report: object): boolean {
  return 'header' in report && typeof report.header === 'object' && report.header !== null && 'glibcVersionRuntime' in report.header;
}

export function hostPlatform(): Platform {
  const musl = process.platform === 'linux' && !glibcRuntime(process.report.getReport());
  return { platform: process.platform, arch: process.arch, musl };
}

function isModuleNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'MODULE_NOT_FOUND';
}

// ADR 0113: the bundled pnpm 12 is a native executable in the `@pnpm/exe.<platform>` package that `pnpm`, a kernel
// dependency, installs; the kernel never downloads one and never uses a global pnpm or corepack.
export function pnpmExecutable(platform: Platform): string {
  const target = `@pnpm/exe.${platform.platform}-${platform.arch}${platform.musl ? '-musl' : ''}`;
  const pnpmManifest = createRequire(import.meta.url).resolve('pnpm/package.json');
  try {
    const manifest = createRequire(pnpmManifest).resolve(`${target}/package.json`);
    return join(dirname(manifest), platform.platform === 'win32' ? 'pnpm.exe' : 'pnpm');
  } catch (error) {
    if (!isModuleNotFound(error)) throw error;
    throw sourceInvalid(`the bundled pnpm has no executable for this platform: ${target} is not installed`, { params: { package: target } });
  }
}

const gitSafety = ['-c', 'protocol.ext.allow=never', '-c', 'protocol.file.allow=user'] as const;

// 06 §6.1, ADR 0116: every git command refuses the ext and file transports, and the clone ends its options with `--`
// before the URL.
export function gitCommands(url: string, commit: string, folder: string): { clone: string[]; checkout: string[]; head: string[] } {
  return {
    clone: [...gitSafety, 'clone', '--no-checkout', '--quiet', '--', url, folder],
    checkout: [...gitSafety, '-C', folder, 'checkout', '--quiet', '--detach', commit],
    head: [...gitSafety, '-C', folder, 'rev-parse', 'HEAD'],
  };
}

const passedVariables = ['PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy'] as const;

// pnpm and git run with the kernel's path and proxy settings and a home inside the staging tree, so no user or
// global configuration changes what gets installed.
export function toolEnvironment(home: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { HOME: home, GIT_TERMINAL_PROMPT: '0', XDG_CONFIG_HOME: join(home, 'config'), XDG_CACHE_HOME: join(home, 'cache') };
  for (const name of passedVariables) {
    const value = source[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
