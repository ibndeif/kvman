// The extensions that ship with kvman (plan 01 §1.4, ADR 0026, 3): the `kvman` package's dependencies that have a
// `kvman` field. A test checks them against that package, so a change there fails until this follows.
export const bundledExtensionNames = ['@kvman/kvai', '@kvman/kvbuilder', '@kvman/kvcoder', '@kvman/kvvideo', '@kvman/kvwebui'] as const;
