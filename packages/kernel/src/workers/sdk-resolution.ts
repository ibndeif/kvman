import { registerHooks } from 'node:module';

// Every `@kvman/sdk` import in a worker resolves to the kernel's own copy, so all extensions share one SDK and one zod
// (plan 02 §2.9), whatever their own node_modules hold.
export function shareKernelSdk(): void {
  registerHooks({
    resolve: (specifier, context, nextResolve) => {
      if (specifier === '@kvman/sdk' || specifier.startsWith('@kvman/sdk/')) {
        return nextResolve(specifier, { ...context, parentURL: import.meta.url });
      }
      return nextResolve(specifier, context);
    },
  });
}
