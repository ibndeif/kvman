// The `preset` connector (plan 09 §9.1): writes and checks preset files.
export const presetConnector = {
  name: 'preset',
  optIn: true as const,
  description: 'Write and check kvman presets. Use it to create a preset file, and to check it before running it. A checked preset is saved with kvman preset-save.',
  commands: [
    { name: 'new', command: 'kvbuilder.preset.new', examples: [{ description: 'Write a preset for a notes app', input: { name: 'notes-app', file: 'notes-app.json' } }] },
    { name: 'check', command: 'kvbuilder.preset.check', examples: [{ description: 'Check that preset', input: { file: 'notes-app.json' } }] },
  ],
};
