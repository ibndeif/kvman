// 12 §12.5: the registry the bundled pnpm uses for npm: sources, read from KVMAN_NPM_REGISTRY when the kernel starts.
export const defaultNpmRegistry = 'https://registry.npmjs.org/';

export function npmRegistryFrom(environment: NodeJS.ProcessEnv): string {
  const registry = environment['KVMAN_NPM_REGISTRY'];
  return registry === undefined || registry === '' ? defaultNpmRegistry : registry;
}
