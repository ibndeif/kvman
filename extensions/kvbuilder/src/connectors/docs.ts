// The `docs` connector (plan 09 §9.1 and §9.5): the guides of kvman and the pages of every installed extension.
export const docsConnector = {
  name: 'docs',
  optIn: true as const,
  description: 'Read the guides of kvman and of every installed extension. Use it before you write an extension, a preset, a view, or a component, and to learn how to use an extension that is installed.',
  commands: [
    { name: 'list', command: 'kvbuilder.guides.list', examples: [{ description: 'List every guide and page', input: {} }] },
    {
      name: 'get',
      command: 'kvbuilder.guides.get',
      examples: [
        { description: 'Read the SDK guide', input: { topic: 'sdk' } },
        { description: "Read an installed extension's page", input: { extension: '@kvman/kvwebui', topic: 'views' } },
      ],
    },
  ],
};
