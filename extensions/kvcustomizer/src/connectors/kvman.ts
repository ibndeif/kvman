// The `kvman` connector (plan 09 §9.1, ADR 0010, 8): changes the app the agent runs in. Each command wraps a kernel command.
export const kvmanConnector = {
  name: 'kvman',
  description:
    'Change the app you are running in: its default model, its settings, its extensions, and its preset. Use it for any change to kvman itself. A change to the extensions or the preset is saved to the preset file and applies at the next start of kvman.',
  commands: [
    { name: 'model-list', command: 'kvcustomizer.app.model.list' },
    { name: 'model-set', command: 'kvcustomizer.app.model.set', examples: [{ description: 'Use another model', input: { model: 'anthropic/claude-sonnet-5-5' } }] },
    { name: 'settings-list', command: 'kvcustomizer.app.settings.list' },
    { name: 'settings-set', command: 'kvcustomizer.app.settings.set', examples: [{ description: 'Set a setting for everyone', input: { key: 'kvwebui.theme', value: 'dark', scope: 'global' } }] },
    { name: 'settings-reset', command: 'kvcustomizer.app.settings.reset', examples: [{ description: 'Go back to the default', input: { key: 'kvwebui.theme', scope: 'global' } }] },
    { name: 'extensions-list', command: 'kvcustomizer.app.extensions.list' },
    { name: 'extensions-install', command: 'kvcustomizer.app.extensions.install', examples: [{ description: 'Add an npm extension', input: { name: '@acme/notes', source: 'npm:1.2.3' } }] },
    { name: 'extensions-uninstall', command: 'kvcustomizer.app.extensions.uninstall', examples: [{ description: 'Remove one', input: { name: '@acme/notes' } }] },
    { name: 'preset-get', command: 'kvcustomizer.app.preset.get' },
  ],
};
