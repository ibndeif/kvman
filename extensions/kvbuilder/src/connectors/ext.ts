// The `ext` connector (plan 09 §9.1): builds extension projects in the workspace, through the testkit's bins.
export const extConnector = {
  name: 'ext',
  description: 'Create, list, check, and test kvman extension projects in the workspace. Use it for any work on an extension, and run check, then test, after changing one.',
  commands: [
    { name: 'new', command: 'kvbuilder.ext.new', examples: [{ description: 'Scaffold a notes extension', input: { name: 'notes', namespace: 'notes', folder: 'notes' } }, { description: 'Scaffold one with a Vue component', input: { name: 'cards', namespace: 'cards', folder: 'cards', web: true } }] },
    { name: 'list', command: 'kvbuilder.ext.list' },
    { name: 'check', command: 'kvbuilder.ext.check', examples: [{ description: 'Check the notes project', input: { folder: 'notes' } }] },
    { name: 'test', command: 'kvbuilder.ext.test', examples: [{ description: 'Test the notes project', input: { folder: 'notes' } }] },
  ],
};
