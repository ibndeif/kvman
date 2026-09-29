import type { FakeProviderOptions } from './fake-provider-extension.ts';

/** A fake LLM provider passed to `createTestKernel`: its options, placed as data (ADRs 0154, 0165). */
export type FakeProvider = { readonly kind: 'fake-provider'; readonly options: FakeProviderOptions };

/** A fake LLM provider for tests, registered through the normal provider API; its options script the answers. */
export function fakeProvider(options: FakeProviderOptions = {}): FakeProvider {
  return { kind: 'fake-provider', options };
}
