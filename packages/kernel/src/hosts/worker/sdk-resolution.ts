import { registerHooks } from 'node:module';

// 06 §6.2: a snapshot never contains @kvman/sdk; every host resolves it to the kernel's own copy.
export function resolveSdkToKernel(): void {
  const sdk = import.meta.resolve('@kvman/sdk');
  registerHooks({
    resolve(specifier, context, next) {
      return specifier === '@kvman/sdk' ? { url: sdk, shortCircuit: true } : next(specifier, context);
    },
  });
}
