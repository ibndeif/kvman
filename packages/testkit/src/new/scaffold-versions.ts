// The versions a scaffold pins (plan 09 §9.2, ADR 0009, 126–127): those the running kvman bundles. A test checks them
// against the monorepo, so a version bump there fails until this follows.
export const scaffoldVersions = {
  sdk: '0.1.0',
  testkit: '0.1.1',
  typescript: '6.0.3',
  typesNode: '24.19.0',
  vite: '8.3.1',
  pluginVue: '6.0.9',
  vue: '3.5.43',
} as const;
