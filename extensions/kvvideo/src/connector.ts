// The `video` connector (plan 16 §16.1 and §16.3; ADR 0107, 11): `optIn`, so a chat has it only after `/video`.

export const connectorName = 'video';

export const videoConnector = {
  name: connectorName,
  optIn: true as const,
  description: 'Make videos: record pages of an app running on this computer, narrate a script, and join them with captions into an MP4. Use it when the person asks for a video, a tutorial, a demo, or a promotion.',
  commands: [
    { name: 'check', command: 'kvvideo.setup.get', examples: [{ description: 'See what is ready before making a video', input: {} }] },
    { name: 'fonts', command: 'kvvideo.font.list', examples: [{ description: 'List the bundled caption fonts', input: {} }] },
    {
      name: 'record',
      command: 'kvvideo.clip.record',
      examples: [
        {
          description: 'Record signing in to the app on its dev server',
          input: { url: 'http://localhost:5173/', file: 'videos/tour/01-sign-in.mp4', steps: [{ do: 'type', target: 'role=textbox[name="Email"]', text: 'sam@example.com' }, { do: 'click', target: 'role=button[name="Sign in"]' }, { do: 'wait', ms: 1500 }] },
        },
      ],
    },
    {
      name: 'narrate',
      command: 'kvvideo.narration.make',
      examples: [{ description: "Narrate the first scene's script", input: { text: 'This is Notes. Sign in with your email to see your notes.', file: 'videos/tour/01-sign-in.mp3' } }],
    },
    {
      name: 'compose',
      command: 'kvvideo.video.compose',
      card: 'kvvideo.player',
      examples: [
        {
          description: 'Join a title image and a narrated recording, with captions',
          input: {
            file: 'videos/tour.mp4',
            scenes: [
              { clip: 'videos/tour/00-title.png', durationMs: 2000 },
              { clip: 'videos/tour/01-sign-in.mp4', narration: 'videos/tour/01-sign-in.mp3', captions: [{ text: 'This is Notes.', startMs: 0, endMs: 1200 }] },
            ],
          },
        },
      ],
    },
  ],
};
