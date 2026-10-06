// The `kvman` connector (plan 09 §9.1; ADR 0010, 8; ADR 0022, 5, 7, and 8; ADR 0023, 2 and 3): shows and changes the app
// the agent runs in. Each command wraps a kernel command or query. The ones that change the app ask the person first.
export const kvmanConnector = {
  name: 'kvman',
  description:
    'Call `init` first when the person asks to change, extend, or customize the app itself: what it does, how it looks, its model, or its settings. See and change the app you are running in: its default model, settings, extensions, and preset, and its workspaces, jobs, processes, and health. Use it for any change to kvman itself. The person is asked before each change. query-get runs a public query of any installed extension. A change to the extensions or the preset is saved to the preset file and applies at the next start of kvman.',
  commands: [
    { name: 'init', command: 'kvcustomizer.app.guide.get', examples: [{ description: 'Read the guide before changing the app', input: {} }] },
    { name: 'model-list', command: 'kvcustomizer.app.model.list' },
    { name: 'model-set', command: 'kvcustomizer.app.model.set', asks: true as const, examples: [{ description: 'Use another model', input: { model: 'anthropic/claude-sonnet-5-5' } }] },
    { name: 'settings-list', command: 'kvcustomizer.app.settings.list' },
    { name: 'settings-set', command: 'kvcustomizer.app.settings.set', asks: true as const, examples: [{ description: 'Set a setting for everyone', input: { key: 'kvwebui.theme', value: 'dark', scope: 'global' } }] },
    { name: 'settings-reset', command: 'kvcustomizer.app.settings.reset', asks: true as const, examples: [{ description: 'Go back to the default', input: { key: 'kvwebui.theme', scope: 'global' } }] },
    { name: 'extensions-list', command: 'kvcustomizer.app.extensions.list' },
    {
      name: 'extensions-install',
      command: 'kvcustomizer.app.extensions.install',
      asks: true as const,
      examples: [
        { description: 'Add an npm extension', input: { source: 'npm:@acme/notes@1.2.3' } },
        { description: 'Add the project in the workspace folder notes', input: { source: 'path:notes' } },
      ],
    },
    { name: 'extensions-uninstall', command: 'kvcustomizer.app.extensions.uninstall', asks: true as const, examples: [{ description: 'Remove one', input: { name: '@acme/notes' } }] },
    { name: 'restart', command: 'kvcustomizer.app.restart', asks: true as const, examples: [{ description: 'Restart kvman to finish adding the notes page', input: {} }] },
    { name: 'preset-get', command: 'kvcustomizer.app.preset.get' },
    { name: 'workspaces-list', command: 'kvcustomizer.app.workspaces.list' },
    { name: 'jobs-list', command: 'kvcustomizer.app.jobs.list', examples: [{ description: 'See the jobs that failed', input: { status: 'failed', limit: 20 } }] },
    { name: 'jobs-get', command: 'kvcustomizer.app.jobs.get', examples: [{ description: 'Read one job', input: { id: 'the job id' } }] },
    { name: 'processes-list', command: 'kvcustomizer.app.processes.list' },
    { name: 'health-get', command: 'kvcustomizer.app.health.get' },
    {
      name: 'query-get',
      command: 'kvcustomizer.app.query.get',
      examples: [
        { description: "Read an installed extension's data", input: { name: 'kvcoder.session.list', input: { limit: 10 } } },
        { description: 'Run a query that takes nothing', input: { name: 'kvai.provider.list' } },
      ],
    },
  ],
};
