// The `video` connector (plan 16 §16.1 and §16.3; ADR 0107, 11): `optIn`, so a chat has it only after `/video`.

export const connectorName = 'video';

export const videoConnector = {
  name: connectorName,
  optIn: true as const,
  description: 'Make videos: record pages of an app running on this computer, narrate a script, and join them with captions into an MP4. Use it when the person asks for a video, a tutorial, a demo, or a promotion.',
  commands: [
    { name: 'check', command: 'kvvideo.setup.get', examples: [{ description: 'See what is ready before making a video', input: {} }] },
    { name: 'fonts', command: 'kvvideo.font.list', examples: [{ description: 'List the bundled caption fonts', input: {} }] },
  ],
};
