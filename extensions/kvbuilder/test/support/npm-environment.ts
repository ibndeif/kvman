import { inject } from 'vitest';

// npm's own environment for tests that install a scaffold: the in-test registry (provided by the global setup), a
// temporary cache, and no audit, fund, or update checks.

declare module 'vitest' {
  export interface ProvidedContext {
    npmRegistry: string;
    npmCache: string;
  }
}

export function npmEnvironment(): Record<string, string> {
  return { npm_config_registry: inject('npmRegistry'), npm_config_cache: inject('npmCache'), npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
}
