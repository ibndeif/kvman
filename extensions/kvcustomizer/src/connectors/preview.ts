// The `preview` connector (plan 09 §9.1 and §9.3): runs projects in a separate kvman.
export const previewConnector = {
  name: 'preview',
  description: 'Run kvman extension projects in a separate kvman with a temporary home. Use it to show the person an extension project working, and stop it when you are done. It runs nothing else: start any other app or page with shell.',
  commands: [
    { name: 'start', command: 'kvcustomizer.preview.start', examples: [{ description: 'Preview the notes project', input: { extensions: ['notes'] } }] },
    { name: 'stop', command: 'kvcustomizer.preview.stop' },
    { name: 'status', command: 'kvcustomizer.preview.status' },
  ],
};
