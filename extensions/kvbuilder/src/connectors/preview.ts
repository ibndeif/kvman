// The `preview` connector (plan 09 §9.1 and §9.3; ADR 0022, 8): runs projects in a separate kvman, and calls them there.
export const previewConnector = {
  name: 'preview',
  description:
    'Run kvman extension projects in a separate kvman with a temporary home. Use it to show the person an extension project working, to check a project by calling its commands and queries, and stop it when you are done. It runs nothing else: start any other app or page with shell.',
  commands: [
    { name: 'start', command: 'kvbuilder.preview.start', examples: [{ description: 'Preview the notes project', input: { extensions: ['notes'] } }] },
    { name: 'stop', command: 'kvbuilder.preview.stop' },
    { name: 'status', command: 'kvbuilder.preview.status' },
    { name: 'query-get', command: 'kvbuilder.preview.query.get', examples: [{ description: "Read the previewed project's data", input: { name: 'notes.item.list' } }] },
    { name: 'command-run', command: 'kvbuilder.preview.command.run', examples: [{ description: 'Run a command of the previewed project', input: { name: 'notes.item.add', input: { text: 'Milk' } } }] },
  ],
};
